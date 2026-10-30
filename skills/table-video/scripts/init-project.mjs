import {initialize} from './core.mjs';
import {options,allowed,run} from './cli.mjs';
await run(async () => {
  const o=options(process.argv.slice(2),['test-only']);
  allowed(o,['project','project-id','test-only']);
  return initialize(o.project,{testOnly:!!o['test-only'],...(o['project-id']?{projectId:o['project-id']}:{})});
});
