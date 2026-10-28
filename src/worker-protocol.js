// A bounded newline-delimited JSON channel, never a shell or arbitrary TCP relay.
export class JsonLines {
  constructor(onMessage,{maxLine=24*1024*1024,maxTotal=64*1024*1024,maxFrames=1024}={}) {
    if(typeof onMessage!=='function'||![maxLine,maxTotal,maxFrames].every(value=>Number.isSafeInteger(value)&&value>0)) throw new Error('Invalid channel limits');
    this.failed=false;this.decoder=new TextDecoder('utf-8',{fatal:true});
    this.onMessage=onMessage;this.maxLine=maxLine;this.maxTotal=maxTotal;this.maxFrames=maxFrames;this.total=0;this.size=0;this.frames=0;this.parts=[];
  }
  push(chunk) {
    if(this.failed) throw new Error('Worker channel closed after failure');
    try {this.read(chunk);} catch(error) {this.failed=true;this.parts=[];this.size=0;throw error;}
  }
  read(chunk) {
    if(!Buffer.isBuffer(chunk)) chunk=Buffer.from(chunk);
    this.total+=chunk.length;if(this.total>this.maxTotal) throw new Error('Worker channel byte budget exceeded');
    let start=0;
    while(start<chunk.length) {
      const end=chunk.indexOf(10,start),part=chunk.subarray(start,end<0?chunk.length:end);
      this.size+=part.length;if(this.size>this.maxLine||this.parts.length>=8192) throw new Error('Worker frame budget exceeded');
      this.parts.push(part);
      if(end<0) return;
      if(++this.frames>this.maxFrames||!this.size) throw new Error('Invalid worker frame count');
      const line=this.decoder.decode(Buffer.concat(this.parts,this.size));this.parts=[];this.size=0;
      this.onMessage(JSON.parse(line));start=end+1;
    }
  }
  end() {if(this.failed) throw new Error('Worker channel closed after failure');if(this.size) {this.failed=true;this.parts=[];this.size=0;throw new Error('Incomplete worker frame');}}
}
export function fields(value,allowed) {
  if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(key=>!allowed.includes(key))) throw new Error('Unexpected worker message');
}
export async function send(stream,value) {
  const data=Buffer.from(JSON.stringify(value)+'\n');if(data.length>24*1024*1024) throw new Error('Outgoing worker frame too large');
  await new Promise((resolve,reject)=>stream.write(data,error=>error?reject(error):resolve()));
}
