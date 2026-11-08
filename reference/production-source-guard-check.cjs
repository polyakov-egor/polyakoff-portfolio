const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const checker=require('./production-source-check.cjs');
const root=path.join(__dirname,'..');
assert.equal(checker.audit(root).retiredReferences,0);
assert.throws(()=>checker.audit(root,{staged:true}),/Retired file physically remains/,'Local archived modules must not be accepted as a publication tree');
const source=fs.readFileSync(path.join(__dirname,'production-source-check.cjs'),'utf8');
function withFs(overrides){
  const localModule={exports:{}};
  vm.runInNewContext(source,{require:name=>name==='node:fs'?{...fs,...overrides}:require(name),module:localModule,exports:localModule.exports,__dirname,console,process});
  return localModule.exports;
}
const unsafe=withFs({readFileSync(filename,...rest){
  const content=fs.readFileSync(filename,...rest);
  return path.resolve(filename)===path.join(root,'index.html')?content.replace('</head>','<script src="./background-lines.js"></script></head>'):content;
}});
assert.throws(()=>unsafe.audit(root),/Retired module referenced/,'A reintroduced retired script is blocked before staging');
const missing=withFs({statSync(filename,...rest){
  if(String(filename).endsWith('backgrounds'+path.sep+'dark.webp'))throw Error('Missing expected dark raster');
  return fs.statSync(filename,...rest);
}});
assert.throws(()=>missing.audit(root),/Missing expected dark raster/,'A missing raster blocks staging before any source copy');
console.log('Production guards passed: current runtime, retired-reference rejection, retired-file rejection and required raster presence.');
