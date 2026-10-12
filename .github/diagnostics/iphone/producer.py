#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
import hashlib,json,os,shutil,stat,subprocess,sys,zipfile
from pathlib import Path,PurePosixPath
HEAD='21c161a9cca7da90f98909f441ecf189061501b1'
TREE='afa939d270d070764d78a2d553c64cf26b3b3f1b'
ZIP='f0597db8a18add7225c5cad61fd2950941202a624e613468e9d6e5e85aa59bc2'
MANIFEST='90241710c4385a145ea6c1b2c3ced25e40e5360252b41c7c911e6eb127f38939'
RUNTIME='834623cdb3e36fd8f810fd8fa9a8d22915320203416ccf9dbc477d0869022bca'
TITLE='Breakout stays game-first with unobscured horizontal touch and Serve controls in compact portrait/landscape software Home mode'
STATUSES={'passed','failed','timedOut','interrupted','skipped'}
CODES={'SOURCE_DRIFT','UNREVIEWED_INPUT','MANIFEST_DRIFT','RUNTIME_IDENTITY','RUNTIME_PATH','RUNTIME_BYTES','ARTIFACT_DIGEST','FRESH_PACKAGE_REQUIRED','ARTIFACT_PATH','ARTIFACT_FILE_TYPE','DUPLICATE_FILE','POST_BINDING_DRIFT','HELPER_DRIFT','CASE_IDENTITY','EXACT_ONE_CASE','EVIDENCE_FILE_TYPE','DISCOVERY_IDENTITY','RECEIPT_METADATA_BOUND'}
LIMIT=8*1024*1024
RECEIPT_LIMIT=64*1024
ROOT=Path.cwd(); BASE=ROOT/'build/iphone-package-input'; OUTPUT=ROOT/'build/iphone-diagnostic-evidence'
def sha(p):return hashlib.sha256(p.read_bytes()).hexdigest()
def git(*args):return subprocess.check_output(['git',*args],text=True).strip()
def require(ok,code):
 if not ok:raise ValueError(code)
def verify():
 require(git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE and not git('status','--porcelain','--untracked-files=all'),'SOURCE_DRIFT')
 require(not os.environ.get('NOCPU_ROM_DIR') and not os.environ.get('NOCPU_TEST_BASE_URL'),'UNREVIEWED_INPUT')
 mpath=BASE/'pages/BUILD-MANIFEST.json';require(sha(mpath)==MANIFEST,'MANIFEST_DRIFT');m=json.loads(mpath.read_text())
 require(m['runtime_sha256']==RUNTIME and m['source_commit']=='9e7af75c0e2ad882e0eefbdb348e31f7fcd8711e' and len(m['runtime_files'])==11,'RUNTIME_IDENTITY')
 records=[]
 for r in m['runtime_files']:
  rel=PurePosixPath(r['path']);require(not rel.is_absolute() and '..'not in rel.parts,'RUNTIME_PATH')
  p=BASE/'pages'/rel;require(p.is_file() and not p.is_symlink() and p.stat().st_size==r['size'] and sha(p)==r['sha256'],'RUNTIME_BYTES');records.append(r)
 return {'source_head':HEAD,'source_tree':TREE,'retained_package_source':m['source_commit'],'runtime_sha256':RUNTIME,'runtime_files':records,'manifest_sha256':MANIFEST,'retained_run_id':38263904323,'artifact_id':11758913240,'artifact_sha256':ZIP}
def prepare():
 archive=BASE/'evidence.zip';require(sha(archive)==ZIP,'ARTIFACT_DIGEST');require(not(BASE/'pages').exists(),'FRESH_PACKAGE_REQUIRED')
 with zipfile.ZipFile(archive)as zipped:
  names=set()
  for info in zipped.infolist():
   rel=PurePosixPath(info.filename)
   require(not rel.is_absolute() and '..'not in rel.parts and '\\'not in info.filename,'ARTIFACT_PATH')
   if not info.filename.startswith('pages/'):continue
   if info.is_dir():continue
   kind=stat.S_IFMT(info.external_attr>>16);require(kind in (0,stat.S_IFREG),'ARTIFACT_FILE_TYPE');require(info.filename not in names,'DUPLICATE_FILE');names.add(info.filename)
   data=zipped.read(info);target=BASE/rel;target.parent.mkdir(parents=True,exist_ok=True)
   with target.open('xb')as out:out.write(data)
 policy=ROOT.parent/'policy/.github/diagnostics/iphone';target=ROOT/'build/v060/frontend/live-public-proposal-v1';target.mkdir(parents=True,exist_ok=True)
 for name in ('breakout-launch-diagnostic.ts','breakout-launch-diagnostic.spec.ts','iphone-diagnostic.config.ts'):shutil.copyfile(policy/name,target/name)
 binding=verify();binding['helper_files']={name:sha(target/name)for name in ('breakout-launch-diagnostic.ts','breakout-launch-diagnostic.spec.ts','iphone-diagnostic.config.ts')};binding['policy_commit']=subprocess.check_output(['git','-C',str(ROOT.parent/'policy'),'rev-parse','HEAD'],text=True).strip()
 (BASE/'binding.json').write_text(json.dumps(binding,indent=2)+'\n')
def atomic_receipt(receipt):
 temporary=OUTPUT.parent/'iphone-diagnostic-receipt.next';created=False
 payload=(json.dumps(receipt,indent=2)+'\n').encode();require(len(payload)<=RECEIPT_LIMIT,'RECEIPT_METADATA_BOUND')
 try:
  with temporary.open('xb')as stream:
   created=True;stream.write(payload);stream.flush();os.fsync(stream.fileno())
  os.replace(temporary,OUTPUT/'receipt.json')
 finally:
  if created:temporary.unlink(missing_ok=True)
def entries(matrix):
 def walk(suites):
  for suite in suites:
   yield from walk(suite.get('suites',[]))
   for spec in suite.get('specs',[]):
    for test in spec.get('tests',[]):yield spec,test
 return list(walk(matrix.get('suites',[])))
def discover():
 matrix=json.loads((BASE/'discovery.json').read_text());rows=entries(matrix)
 require(len(rows)==1 and rows[0][0]['title']==TITLE and rows[0][1]['projectName']=='iphone-emulated' and not matrix.get('errors'),'DISCOVERY_IDENTITY')
 (BASE/'discovery-proof.json').write_text(json.dumps({'title':TITLE,'profile':'iphone-emulated','discovered':1,'sha256':sha(BASE/'discovery.json')})+'\n')
def report():
 OUTPUT.mkdir(exist_ok=False);receipt={'status':'incomplete','case_outcome':'unknown','prior_failure_not_superseded':True,'media_retained':False}
 try:
  old=json.loads((BASE/'binding.json').read_text());current=verify();require(all(old[k]==v for k,v in current.items()),'POST_BINDING_DRIFT')
  target=ROOT/'build/v060/frontend/live-public-proposal-v1';require(all(sha(target/n)==v for n,v in old['helper_files'].items()),'HELPER_DRIFT')
  matrix_path=ROOT/'build/iphone-launch-diagnostic-v1/matrix.json';matrix=json.loads(matrix_path.read_text());rows=[]
  for spec,test in entries(matrix):
   require(spec.get('title')==TITLE and test.get('projectName')=='iphone-emulated' and len(test.get('results',[]))==1 and test['results'][0].get('status')in STATUSES,'CASE_IDENTITY');rows.append({'title':TITLE,'profile':'iphone-emulated','status':test['results'][0]['status']})
  require(len(rows)==1,'EXACT_ONE_CASE');receipt.update(status='observed',case_outcome=rows[0]['status'],cases=rows,global_error_count=len(matrix.get('errors',[])),binding=old,matrix_sha256=sha(matrix_path))
  atomic_receipt(receipt)
  files=[]
  for p in sorted((ROOT/'build/iphone-launch-diagnostic-v1').rglob('*')):
   if p.is_dir():continue
   require(p.is_file()and not p.is_symlink(),'EVIDENCE_FILE_TYPE');files.append(p)
  total=sum(p.stat().st_size for p in files);receipt['evidence_bytes']=total
  if total<=LIMIT-RECEIPT_LIMIT:
   for p in files:
    target=OUTPUT/'observed'/p.relative_to(ROOT/'build/iphone-launch-diagnostic-v1');target.parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(p,target)
   receipt['media_retained']=True
  else:receipt['evidence_bound_category']='EVIDENCE_OVER_8MIB'
 except Exception as error:
  receipt['safe_error_category']=str(error)if isinstance(error,ValueError)and str(error)in CODES else 'UNCLASSIFIED_PRODUCER_FAILURE'
 atomic_receipt(receipt)
 if receipt['status']!='observed' or not receipt['media_retained']:raise SystemExit(1)
if __name__=='__main__':{'prepare':prepare,'discover':discover,'report':report}[sys.argv[1]]()
