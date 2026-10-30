import fs from 'node:fs/promises';
export class WorkflowError extends Error {
  constructor(code, message) { super(message); this.code = code; }
}
export function requireValue(condition, code, message) {
  if (!condition) throw new WorkflowError(code, message);
}
export function text(value, name) {
  requireValue(typeof value === 'string' && value.trim().length > 0, 'INVALID_INPUT', name + ' must be a non-empty string');
  return value;
}
export function id(value, name = 'id') {
  text(value, name);
  requireValue(/^[A-Za-z0-9][A-Za-z0-9_.:-]{0,119}$/.test(value), 'INVALID_ID', name + ' has unsupported characters');
  return value;
}
export const SLOTS = ['script', 'narration', 'design', 'storyboard', 'visualOverview', 'mainProject', 'finalVideo'];
export const KINDS = ['script', 'narration', 'design', 'storyboard', 'static', 'pilot', 'video', 'asset', 'config', 'other'];
export const ACTIONS = ['storyboard', 'design', 'animate', 'batch-animate', 'pilot', 'picture-lock', 'final', 'publish', ...SLOTS.map(s => 'adopt:' + s)];
export const RESULTS = ['通过', '未通过', '未验证', '不适用'];
export const METHODS = ['technical', 'human-view', 'human-listen', 'inspection'];
export const PAYLOADS = {
  'risk-proof': ['riskObjectId', 'pilotObjectId'],
  'narration-gain-adopt': ['objectId', 'approvalId', 'evidence'],
  choices: ['partial'], register: ['id', 'path', 'kind'], dependency: ['from', 'to'],
  review: ['id', 'objectId', 'aspect', 'allows'], approve: ['reviewId', 'decision', 'evidence'],
  adopt: ['slot', 'objectId', 'approvalId'], qa: ['checkId', 'objectId', 'aspect', 'result', 'method', 'evidence'],
  stage: ['stage'], rebind: ['objectId', 'path'], revoke: ['approvalId'],
  segment: ['id', 'objectId', 'narrative', 'anchors', 'route'], finalize: ['mode'],
};
// Deliberately small, dependency-free validator for the bundled schemas.
export function checkSchema(value, schema, at = '$') {
  if (schema.type) {
    const valid = schema.type === 'object' ? value !== null && typeof value === 'object' && !Array.isArray(value)
      : schema.type === 'array' ? Array.isArray(value)
      : schema.type === 'integer' ? Number.isSafeInteger(value)
      : typeof value === schema.type;
    requireValue(valid, 'SCHEMA', at + ' must be ' + schema.type);
  }
  if (schema.enum) requireValue(schema.enum.includes(value), 'SCHEMA', at + ' is outside enum');
  if (schema.minimum !== undefined) requireValue(value >= schema.minimum, 'SCHEMA', at + ' below minimum');
  if (schema.minLength !== undefined) requireValue(value.length >= schema.minLength, 'SCHEMA', at + ' empty');
  if (schema.minItems !== undefined) requireValue(value.length >= schema.minItems, 'SCHEMA', at + ' has too few items');
  if (schema.required) for (const key of schema.required) requireValue(Object.hasOwn(value, key), 'SCHEMA', at + '.' + key + ' required');
  if (schema.properties) for (const [key, child] of Object.entries(value)) {
    if (schema.properties[key]) checkSchema(child, schema.properties[key], at + '.' + key);
    else if (schema.additionalProperties === false) throw new WorkflowError('SCHEMA', at + '.' + key + ' unsupported');
  }
  if (schema.items) value.forEach((v, i) => checkSchema(v, schema.items, at + '[' + i + ']'));
}
export async function validateState(state) {
  const schema = JSON.parse(await fs.readFile(new URL('../schemas/state.schema.json', import.meta.url), 'utf8'));
  checkSchema(state, schema);
  for (const [key, artifact] of Object.entries(state.artifacts)) {
    id(key); requireValue(artifact.id === key, 'SCHEMA', 'artifact key mismatch');
    text(artifact.path, 'artifact.path'); requireValue(KINDS.includes(artifact.kind), 'SCHEMA', 'artifact.kind invalid');
  }
  for (const dep of state.dependencies) {
    requireValue(state.artifacts[dep.from] && state.artifacts[dep.to], 'SCHEMA', 'dependency points to missing object');
  }
  for (const slot of SLOTS) requireValue(state.adopted[slot] === null || typeof state.adopted[slot] === 'object', 'SCHEMA', 'adopted slot invalid');
  return state;
}
export async function validateRequest(request) {
  const schema = JSON.parse(await fs.readFile(new URL('../schemas/request.schema.json', import.meta.url), 'utf8'));
  checkSchema(request, schema); id(request.operationId, 'operationId');
  const required = PAYLOADS[request.type];
  requireValue(required, 'INVALID_OPERATION', 'unsupported operation type');
  for (const key of required) requireValue(Object.hasOwn(request.payload, key), 'INVALID_INPUT', request.type + '.' + key + ' required');
  return request;
}
