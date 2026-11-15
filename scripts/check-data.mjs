import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function isPrivateData(path,content){
  if(/(^|\/)(backups|exports|recovery|private)(\/|$)/i.test(path)||/(backup|recovery).*\.json$/i.test(path))return true;
  try{const value=JSON.parse(content);return value?.format==='cookies-campus'||(value?.version===1&&Array.isArray(value?.sales)&&Array.isArray(value?.payments));}catch{return false;}
}
export async function checkRepositoryData(){
  const files=execFileSync('git',['ls-files','--cached','--others','--exclude-standard','-z'],{encoding:'utf8'}).split('\0').filter(Boolean);
  for(const file of new Set(files)){let content;try{content=await readFile(file,'utf8');}catch(e){if(e.code==='ENOENT')continue;throw e;}if(isPrivateData(file,content))throw new Error(`Possível backup/dado privado no repositório: ${file}. Remova-o da seleção de publicação, sem apagar seu backup.`);}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await checkRepositoryData();console.log('Verificação de dados privados aprovada.');}
