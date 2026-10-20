const { generateKeyPairSync } = require("crypto");

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  publicKeyEncoding: { type: "spki", format: "pem" },
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
});

console.log(`JWT_PRIVATE_KEY=${Buffer.from(privateKey).toString("base64")}`);
console.log(`JWT_PUBLIC_KEY=${Buffer.from(publicKey).toString("base64")}`);
