import { BlockList, isIP } from 'node:net';
import { lookup as dnsLookup } from 'node:dns/promises';
import { normalizeUrl } from './url.js';

const denied = new BlockList();
for (const [ip,bits] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],
  ['172.16.0.0',12],['192.0.0.0',24],['192.0.2.0',24],['192.88.99.0',24],['192.168.0.0',16],
  ['198.18.0.0',15],['198.51.100.0',24],['203.0.113.0',24],['224.0.0.0',4],['240.0.0.0',4]]) denied.addSubnet(ip,bits,'ipv4');
for(const [ip,bits] of [['2001::',23],['2001:db8::',32],['2002::',16],['3fff::',20]]) denied.addSubnet(ip,bits,'ipv6');
const globalV6 = new BlockList();globalV6.addSubnet('2000::',3,'ipv6');
export function isPublicAddress(address) {
  const family=isIP(address);
  return family===4 ? !denied.check(address,'ipv4') : family===6 && globalV6.check(address,'ipv6') && !denied.check(address,'ipv6');
}
export function origin(value) {
  const url=new URL(normalizeUrl(value));
  if(url.pathname!=='/' || url.search || url.hash) throw new Error('Network origins must not include paths, queries or fragments');
  return url.origin;
}
export function validateNetwork(input = {}) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new Error('network must be an object');
  for(const key of Object.keys(input)) if(!['resourceOrigins','allowPrivateOrigins','allowedPorts'].includes(key)) throw new Error(`Unknown network property: ${key}`);
  const origins=(value,label)=>{
    if(value===undefined) return [];
    if(!Array.isArray(value)||value.length>30) throw new Error(`${label} must contain at most 30 origins`);
    return [...new Set(value.map(origin))].sort();
  };
  const ports=input.allowedPorts ?? [80,443];
  if(!Array.isArray(ports)||!ports.length||ports.length>16||ports.some(p=>!Number.isInteger(p)||p<1||p>65535)) throw new Error('allowedPorts must contain 1–16 valid port numbers');
  return {resourceOrigins:origins(input.resourceOrigins,'resourceOrigins'),allowPrivateOrigins:origins(input.allowPrivateOrigins,'allowPrivateOrigins'),allowedPorts:[...new Set(ports)].sort((a,b)=>a-b)};
}
export function createNetworkPolicy(urls, config = {}) {
  const network=validateNetwork(config);
  const navigationOrigins=new Set(urls.map(value=>new URL(normalizeUrl(value)).origin));
  const resourceOrigins=new Set([...navigationOrigins,...network.resourceOrigins]);
  const privateOrigins=new Set(network.allowPrivateOrigins);
  for(const value of privateOrigins) if(!resourceOrigins.has(value)) throw new Error('Private exceptions must also be declared target/resource origins');
  function check(value, navigation = false) {
    const url=new URL(normalizeUrl(value));
    if(!(navigation?navigationOrigins:resourceOrigins).has(url.origin)) throw new Error('Origin is outside the declared network scope');
    const port=Number(url.port || (url.protocol==='https:'?443:80));
    if(!network.allowedPorts.includes(port)&&!privateOrigins.has(url.origin)) throw new Error('Port is outside the declared network scope');
    return url;
  }
  return {check,network,navigationOrigins,resourceOrigins,privateOrigins};
}
export async function resolveTarget(value, policy, {lookup = dnsLookup} = {}) {
  const url=policy.check(value);
  const hostname=url.hostname.replace(/^\[|\]$/g,'');
  const entries=isIP(hostname) ? [{address:hostname,family:isIP(hostname)}] : await lookup(hostname,{all:true,verbatim:true});
  if(!Array.isArray(entries)||!entries.length||entries.some(e=>!isIP(e.address))) throw new Error('DNS returned no valid addresses');
  if(!policy.privateOrigins.has(url.origin)&&entries.some(e=>!isPublicAddress(e.address))) throw new Error('Private or special-purpose network address blocked');
  const selected=entries.find(e=>isIP(e.address)===4) ?? entries[0];
  // Transport connects to this numeric address, never resolving the hostname again.
  return {url,address:selected.address,family:isIP(selected.address),port:Number(url.port || (url.protocol==='https:'?443:80))};
}
