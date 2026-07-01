/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  serverExternalPackages: ["@prisma/client", "argon2", "nodemailer"],
};

module.exports = nextConfig;
