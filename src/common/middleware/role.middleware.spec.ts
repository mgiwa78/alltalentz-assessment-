import { hasRole } from "./role.middleware";
import { UserRole } from "@/database/enums/trs.enums";

describe("hasRole", () => {
  it("lets ADMIN through every gate", () => {
    expect(hasRole(UserRole.ADMIN, [UserRole.ESTIMATOR])).toBe(true);
    expect(hasRole(UserRole.ADMIN, [])).toBe(true);
  });

  it("treats the other roles as peers", () => {
    expect(hasRole(UserRole.ESTIMATOR, [UserRole.ESTIMATOR])).toBe(true);
    expect(hasRole(UserRole.ESTIMATOR, [UserRole.PROJECT_MANAGER])).toBe(false);
    expect(hasRole(UserRole.PROJECT_MANAGER, [UserRole.ESTIMATOR])).toBe(false);
  });

  it("denies when there is no role", () => {
    expect(hasRole(null, [UserRole.ESTIMATOR])).toBe(false);
    expect(hasRole(undefined, [UserRole.ESTIMATOR])).toBe(false);
  });
});
