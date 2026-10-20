import { DataSource } from "typeorm";
import { faker } from "@faker-js/faker";
import { Job, JobStatusHistory, User } from "@/database/entities";
import { DamageType, JobStatus, UserRole } from "@/database/enums/trs.enums";
import { calculateEstimatedCost, formatJobId } from "@/modules/jobs/helpers/estimate";
import { seededStaff } from "./user.seeder";

const DESCRIPTIONS: Record<DamageType, string[]> = {
  [DamageType.WATER]: [
    "Water damage affecting the kitchen ceiling and wall.",
    "Burst supply line under the upstairs bathroom sink; ceiling below is sagging and stained.",
    "Washing machine overflow soaked the laundry room subfloor and baseboards.",
    "Roof leak during heavy rain; insulation in the attic and bedroom drywall are wet.",
  ],
  [DamageType.FIRE]: [
    "Kitchen grease fire contained to the stove area; heavy smoke residue throughout the ground floor.",
    "Electrical fire in the garage; wall studs charred and soot on the adjoining hallway.",
    "Dryer vent fire with smoke damage to the laundry room and adjacent bedroom.",
  ],
  [DamageType.MOLD]: [
    "Visible mold growth behind the basement drywall following a slow foundation leak.",
    "Black mold on the bathroom ceiling and around the window frame; persistent musty odour.",
    "Mold found in the crawl space during a pre-sale inspection.",
  ],
  [DamageType.STORM]: [
    "Fallen oak limb punctured the roof over the living room; tarp in place.",
    "Hail damage to roof shingles and siding on the north elevation.",
    "Wind-driven rain entered through a broken window; carpet and drywall in the den are wet.",
  ],
  [DamageType.OTHER]: [
    "Vehicle impact to the front porch and garage door frame.",
    "Sewage backup from the main line into the finished basement.",
  ],
};

const PATH: JobStatus[] = [
  JobStatus.NEW,
  JobStatus.INSPECTION,
  JobStatus.ESTIMATING,
  JobStatus.PROPOSAL_SENT,
  JobStatus.APPROVED,
  JobStatus.IN_PROGRESS,
  JobStatus.COMPLETED,
];

const walk = (target: JobStatus): JobStatus[] => {
  if (target !== JobStatus.CANCELLED) return PATH.slice(0, PATH.indexOf(target) + 1);
  const cancelledFrom = faker.helpers.arrayElement(PATH.slice(0, PATH.indexOf(JobStatus.IN_PROGRESS) + 1));
  return [...PATH.slice(0, PATH.indexOf(cancelledFrom) + 1), JobStatus.CANCELLED];
};

const roundCost = (min: number, max: number) => Math.round(faker.number.float({ min, max }) / 25) * 25;

export class JobSeeder {
  constructor(private readonly count = 24) {}

  public async run(dataSource: DataSource): Promise<void> {
    if ((await dataSource.getRepository(Job).count()) > 0) return;

    faker.seed(20261001);
    const estimators = await seededStaff(dataSource, UserRole.ESTIMATOR);
    const managers = await seededStaff(dataSource, UserRole.PROJECT_MANAGER);
    const actorFor = (status: JobStatus): User =>
      faker.helpers.arrayElement(
        [JobStatus.NEW, JobStatus.INSPECTION, JobStatus.ESTIMATING, JobStatus.PROPOSAL_SENT].includes(status)
          ? estimators
          : managers,
      );

    await dataSource.transaction(async (manager) => {
      for (let n = 1; n <= this.count; n++) {
        const isBriefExample = n === 1;
        const damageType = isBriefExample ? DamageType.WATER : faker.helpers.enumValue(DamageType);
        const target = isBriefExample
          ? JobStatus.NEW
          : faker.helpers.weightedArrayElement([
              { weight: 3, value: JobStatus.NEW },
              { weight: 3, value: JobStatus.INSPECTION },
              { weight: 4, value: JobStatus.ESTIMATING },
              { weight: 3, value: JobStatus.PROPOSAL_SENT },
              { weight: 2, value: JobStatus.APPROVED },
              { weight: 3, value: JobStatus.IN_PROGRESS },
              { weight: 4, value: JobStatus.COMPLETED },
              { weight: 2, value: JobStatus.CANCELLED },
            ]);
        const steps = walk(target);

        let at = faker.date.recent({ days: 120 });
        const createdAt = at;
        const creator = faker.helpers.arrayElement(estimators);
        const history: Partial<JobStatusHistory>[] = [];
        let estimateAt: Date | null = null;

        for (const [i, status] of steps.entries()) {
          if (i > 0) at = new Date(at.getTime() + faker.number.int({ min: 2, max: 96 }) * 3_600_000);
          if (status === JobStatus.PROPOSAL_SENT) estimateAt = new Date(at.getTime() - 3_600_000);
          history.push({
            jobId: formatJobId(n),
            fromStatus: i === 0 ? null : steps[i - 1],
            toStatus: status,
            changedByUserId: i === 0 ? creator.id : actorFor(status).id,
            note: i === 0 ? "Job created" : null,
            createdAt: at,
          });
        }

        const squareFeet = isBriefExample ? 450 : faker.number.int({ min: 60, max: 3200 });
        const breakdown = estimateAt
          ? {
              laborCost: roundCost(squareFeet * 1.5, squareFeet * 5),
              materialCost: roundCost(squareFeet * 1, squareFeet * 6),
              equipmentCost: roundCost(150, 2500),
            }
          : null;

        const customerName = isBriefExample ? "John Smith" : faker.person.fullName();
        await manager.save(
          manager.create(Job, {
            id: formatJobId(n),
            jobNumber: n,
            customerName,
            customerEmail: isBriefExample
              ? "john@example.com"
              : faker.internet.email({ firstName: customerName.split(" ")[0], lastName: customerName.split(" ").slice(-1)[0] }).toLowerCase(),
            propertyAddress: isBriefExample
              ? "123 Main Street"
              : `${faker.location.streetAddress()}, ${faker.location.city()}, ${faker.location.state({ abbreviated: true })}`,
            damageType,
            damageDescription: isBriefExample
              ? DESCRIPTIONS[DamageType.WATER][0]
              : faker.helpers.arrayElement(DESCRIPTIONS[damageType]),
            squareFeet,
            status: steps[steps.length - 1],
            estimatedCost: breakdown ? calculateEstimatedCost(breakdown) : 0,
            laborCost: breakdown?.laborCost ?? null,
            materialCost: breakdown?.materialCost ?? null,
            equipmentCost: breakdown?.equipmentCost ?? null,
            estimatedAt: estimateAt,
            estimatedByUserId: estimateAt ? faker.helpers.arrayElement(estimators).id : null,
            createdByUserId: creator.id,
            createdAt,
            updatedAt: at,
          }),
        );
        await manager.save(manager.create(JobStatusHistory, history));
      }
    });
  }
}
