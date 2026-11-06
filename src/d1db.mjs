// Worker-side db adapter. The jobs only need two operations:
//   query(sql)        -> rows of one statement
//   run(statements[]) -> execute several statements atomically (one D1 batch)
// scripts/lib.mjs provides the same shape on top of the wrangler CLI for manual runs.
export const bindingDb = (DB) => ({
  async query(sql) {
    return (await DB.prepare(sql).all()).results;
  },
  async run(statements) {
    await DB.batch(statements.map((s) => DB.prepare(s)));
  },
});
