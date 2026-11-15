import { mkdir, cp, readdir } from "node:fs/promises";
import {checkRepositoryData} from './check-data.mjs';
await checkRepositoryData();
const files=['index.html','styles.css','src/app.js','src/domain.js','src/db.js','src/operations-ui.js','icons/icon.svg','icons/icon-192.png','icons/icon-512.png','icons/apple-touch-icon.png','manifest.webmanifest','sw.js'];
await mkdir("dist", { recursive: true });
// Do not silently delete unexpected files: stop before a possibly private file is published.
async function inspect(dir,prefix=''){for(const entry of await readdir(dir,{withFileTypes:true})){const name=prefix+entry.name;if(entry.isDirectory())await inspect(`${dir}/${entry.name}`,name+'/');else if(!files.includes(name))throw new Error(`Arquivo não permitido no build: dist/${name}. Mova-o para fora de dist antes de publicar.`);}}
await inspect('dist');
for(const f of files){await mkdir(`dist/${f.substring(0,f.lastIndexOf('/')+1)}`,{recursive:true});await cp(f,`dist/${f}`);}
console.log("Aplicação estática preparada em dist/");
