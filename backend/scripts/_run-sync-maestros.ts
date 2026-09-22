import { sincronizarTodo } from "../src/lib/syncMaestros";

sincronizarTodo()
  .then((r) => console.log(JSON.stringify(r, null, 2)))
  .catch((e) => { console.error(e); process.exitCode = 1; });
