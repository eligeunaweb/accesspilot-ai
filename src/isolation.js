import {fields} from './worker-protocol.js';
export function immutableImage(value) {
  if(typeof value!=='string'||!/^sha256:[a-f0-9]{64}$/.test(value))throw new Error('An immutable local image ID is required');
  return value;
}
export function validateIsolation(value) {
  fields(value,['backend','profileVersion','imageId','chromiumSandbox']);
  if(value.backend!=='docker-stdio'||value.profileVersion!==1||value.chromiumSandbox!==true)throw new Error('Invalid worker isolation evidence');
  return {backend:'docker-stdio',profileVersion:1,imageId:immutableImage(value.imageId),chromiumSandbox:true};
}
