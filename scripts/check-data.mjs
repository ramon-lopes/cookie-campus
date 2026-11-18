import {execFileSync} from 'node:child_process';
import {readFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
export function isPrivateData(path,content){
  if(/(^|\/)(backups|exports|recovery|private)(\/|$)/i.test(path)||/(backup|recovery).*\.json$/i.test(path))return true;
  try{const value=JSON.parse(content);return value?.format==='cookies-campus'||(value?.version===1&&Array.isArray(value?.sales)&&Array.isArray(value?.payments));}catch{return false;}
}
export async function checkRepositoryData(buildFiles) {
  let files;
  try {
    files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "-z"], {
      encoding: "utf8", stdio: ["ignore", "pipe", "pipe"],
    }).split("\0").filter(Boolean);
  } catch (err) {
    const noRepository = err.code === "ENOENT" || String(err.stderr).includes("not a git repository");
    if (!buildFiles || !noRepository) throw err;
    // A source archive can build without Git. Only the explicit build files can be published.
    files = buildFiles;
  }
  for (const file of new Set(files)) {
    let content;
    try {
      content = await readFile(file, "utf8");
    } catch (err) {
      if (err.code === "ENOENT") continue;
      throw err;
    }
    if (isPrivateData(file, content))
      throw new Error(`Possível backup/dado privado no repositório: ${file}. Remova-o da seleção de publicação, sem apagar seu backup.`);
  }
}
if(process.argv[1]&&import.meta.url===pathToFileURL(process.argv[1]).href){await checkRepositoryData();console.log('Verificação de dados privados aprovada.');}
