process.once('message',message=>{
  const p=JSON.parse(message.input);
  if(p.mode==='spin'){process.stdout.write('started');while(true){}}
  if(p.mode==='crash')process.exit(7);
  if(p.mode==='malformed'){process.send({unexpected:true});return;}
  if(p.mode==='oversize')process.send({ok:true,body:'x'.repeat(100)});
  else process.send({ok:true,body:String(process.pid)});
});
