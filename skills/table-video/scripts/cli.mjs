import fs from 'node:fs/promises';
import {WorkflowError} from './schema.mjs';

export function options(argv, booleans = []) {
  const result = {};
  for (let i = 0; i < argv.length; i++) {
    const token = argv[i];
    if (!token.startsWith('--') || Object.hasOwn(result, token.slice(2))) throw new WorkflowError('ARGUMENT', 'Unknown or duplicate argument: ' + token);
    const key = token.slice(2);
    if (booleans.includes(key)) result[key] = true;
    else {
      if (!argv[i + 1] || argv[i + 1].startsWith('--')) throw new WorkflowError('ARGUMENT', 'Missing value: ' + token);
      result[key] = argv[++i];
    }
  }
  return result;
}
export function allowed(o, keys) {
  for (const key of Object.keys(o)) if (!keys.includes(key)) throw new WorkflowError('ARGUMENT', 'Unsupported option: --' + key);
  if (!o.project) throw new WorkflowError('ARGUMENT', '--project is required');
}
export async function requestFile(o) {
  if (!o.request) throw new WorkflowError('ARGUMENT', '--request must point to a JSON file');
  return JSON.parse((await fs.readFile(o.request, 'utf8')).replace(/^\uFEFF/, ''));
}
export async function run(task) {
  try {
    const result = await task();
    process.stdout.write(JSON.stringify(result, null, 2) + '\n');
    if (result?.ok === false) process.exitCode = 2;
  } catch (error) {
    process.stderr.write(JSON.stringify({ok:false,code:error.code || 'ERROR',message:error.message}) + '\n');
    process.exitCode = 1;
  }
}
