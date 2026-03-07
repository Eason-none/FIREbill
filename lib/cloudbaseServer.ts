import cloudbase from "@cloudbase/node-sdk";

let dbInstance: ReturnType<ReturnType<typeof cloudbase.init>["database"]> | null = null;

function getRequiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`缺少环境变量 ${name}`);
  }
  return value;
}

export function getCloudbaseDb() {
  if (dbInstance) {
    return dbInstance;
  }

  const env = getRequiredEnv("TCB_ENV_ID");
  const secretId = getRequiredEnv("TCB_SECRET_ID");
  const secretKey = getRequiredEnv("TCB_SECRET_KEY");

  const app = cloudbase.init({
    env,
    secretId,
    secretKey
  });

  dbInstance = app.database();
  return dbInstance;
}

