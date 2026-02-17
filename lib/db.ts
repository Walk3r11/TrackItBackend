import { config } from "dotenv";
config({ path: ".env.local" });
config();

import { neon, NeonQueryFunction } from "@neondatabase/serverless";

let _sql: NeonQueryFunction<false, false> | null = null;

function getSql(): NeonQueryFunction<false, false> {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL is not set");
  }
  if (!_sql) {
    _sql = neon(connectionString);
  }
  return _sql;
}

const sqlFn = function(strings: TemplateStringsArray, ...values: any[]) {
  return getSql()(strings, ...values);
};

export const sql = sqlFn as NeonQueryFunction<false, false>;
