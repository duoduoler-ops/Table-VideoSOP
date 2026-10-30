import {status,apply,validate,renderPlan,recover,prepareMigration,commitMigration,cancelMigration} from './core.mjs';
import {WorkflowError} from './schema.mjs';
import {options,allowed,requestFile,run} from './cli.mjs';
await run(async () => {
  const [command,...args]=process.argv.slice(2),o=options(args);
  allowed(o,['project',...(command==='validate'?['action','scope']:[]),...(['apply','adopt','migrate-prepare','migrate-commit','migrate-cancel'].includes(command)?['request']:[])]);
  switch(command) {
    case 'status': return status(o.project);
    case 'next': return (await status(o.project)).next;
    case 'apply': return apply(o.project,await requestFile(o));
    case 'adopt': {
      const request=await requestFile(o);
      if(request.type!=='adopt') throw new WorkflowError('ARGUMENT','adopt requires an adopt request');
      return apply(o.project,request);
    }
    case 'validate': return validate(o.project,{action:o.action,scope:o.scope});
    case 'render-plan': return renderPlan(o.project);
    case 'recover': return recover(o.project);
    case 'migrate-prepare': return prepareMigration(o.project,o.request?await requestFile(o):{});
    case 'migrate-commit': return commitMigration(o.project,await requestFile(o));
    case 'migrate-cancel': return cancelMigration(o.project,await requestFile(o));
    default: throw new WorkflowError('ARGUMENT','Use status, next, apply, adopt, validate, render-plan, recover, migrate-prepare, migrate-commit or migrate-cancel');
  }
});
