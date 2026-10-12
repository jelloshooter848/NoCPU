#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
import hashlib,json,os,shutil,stat,subprocess,sys,zipfile
from pathlib import Path,PurePosixPath
HEAD='9e7af75c0e2ad882e0eefbdb348e31f7fcd8711e'
TREE='afa939d270d070764d78a2d553c64cf26b3b3f1b'
CORE_ZIP='3f049cdcf1368756ddcbe22f561130c0cfb88b9979efa0de26ab72f56ecbd081'
ZIP='f0597db8a18add7225c5cad61fd2950941202a624e613468e9d6e5e85aa59bc2'
MANIFEST='90241710c4385a145ea6c1b2c3ced25e40e5360252b41c7c911e6eb127f38939'
RUNTIME='834623cdb3e36fd8f810fd8fa9a8d22915320203416ccf9dbc477d0869022bca'
TITLE='Breakout stays game-first with unobscured horizontal touch and Serve controls in compact portrait/landscape software Home mode'
STATUSES={'passed','failed','timedOut','interrupted','skipped'}
CODES={'SOURCE_DRIFT','UNREVIEWED_INPUT','MANIFEST_DRIFT','RUNTIME_IDENTITY','RUNTIME_PATH','RUNTIME_BYTES','ARTIFACT_DIGEST','FRESH_PACKAGE_REQUIRED','ARTIFACT_PATH','ARTIFACT_FILE_TYPE','DUPLICATE_FILE','POST_BINDING_DRIFT','HELPER_DRIFT','CASE_IDENTITY','EXACT_ONE_CASE','EVIDENCE_FILE_TYPE','DISCOVERY_IDENTITY','RECEIPT_METADATA_BOUND','CORE_ARTIFACT_DIGEST','CORE_TRANSFER_SET','CORE_INPUTS','CORE_INPUT_BYTES','CORE_INPUT_PATH','CORE_MISSING'}
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
  p=BASE/'pages'/rel;regular=p.is_file()and not p.is_symlink();actual_size=p.stat().st_size if regular else None;actual_sha=sha(p)if regular else None;records.append(dict(r,actual_size=actual_size,actual_sha256=actual_sha,present=regular,matched=regular and actual_size==r['size']and actual_sha==r['sha256']))
 (BASE/'runtime-audit.json').write_text(json.dumps({'records':records,'all_eleven_match':all(r['matched']for r in records)},indent=2)+'\n')
 require(all(r['matched']for r in records),'RUNTIME_BYTES')
 records=m['runtime_files']
 return {'source_head':HEAD,'source_tree':TREE,'retained_package_source':m['source_commit'],'runtime_sha256':RUNTIME,'runtime_files':records,'manifest_sha256':MANIFEST,'retained_run_id':38263904323,'artifact_id':11758913240,'artifact_sha256':ZIP}
def extract(zipped, info, target):
 rel=PurePosixPath(info.filename);require(not rel.is_absolute()and '..'not in rel.parts and '\\'not in info.filename,'ARTIFACT_PATH')
 kind=stat.S_IFMT(info.external_attr>>16);require(kind in (0,stat.S_IFREG),'ARTIFACT_FILE_TYPE');target.parent.mkdir(parents=True,exist_ok=True)
 with target.open('xb')as out:out.write(zipped.read(info))
def prepare():
 require(git('rev-parse','HEAD')==HEAD and git('rev-parse','HEAD^{tree}')==TREE,'SOURCE_DRIFT')
 archive=BASE/'evidence.zip';require(sha(archive)==ZIP,'ARTIFACT_DIGEST');require(not(BASE/'pages').exists(),'FRESH_PACKAGE_REQUIRED')
 with zipfile.ZipFile(archive)as zipped:
  infos=[i for i in zipped.infolist()if i.filename=='pages/BUILD-MANIFEST.json'];require(len(infos)==1,'MANIFEST_DRIFT');extract(zipped,infos[0],BASE/'pages/BUILD-MANIFEST.json')
 require(sha(BASE/'pages/BUILD-MANIFEST.json')==MANIFEST,'MANIFEST_DRIFT')
 archive=BASE/'core.zip';require(sha(archive)==CORE_ZIP,'CORE_ARTIFACT_DIGEST')
 expected={'core-transfer.json',*[f'wasm/{name}'for name in ('nocpu.js','nocpu.wasm','build-provenance.json','dependencies.mk','linker.map')]}
 with zipfile.ZipFile(archive)as zipped:
  infos=[i for i in zipped.infolist()if not i.is_dir()];require(len(infos)==len(expected)and {i.filename for i in infos}==expected,'CORE_TRANSFER_SET')
  for info in infos:extract(zipped,info,ROOT/'build/core'/info.filename)
 policy=ROOT.parent/'policy/.github/diagnostics/iphone';target=ROOT/'build/v060/frontend/live-public-proposal-v1';target.mkdir(parents=True,exist_ok=True)
 for name in ('breakout-launch-diagnostic.ts','breakout-launch-diagnostic.spec.ts','iphone-diagnostic.config.ts'):shutil.copyfile(policy/name,target/name)
def core_inputs():
 file=ROOT/'build/core/wasm/build-provenance.json';require(file.is_file(),'CORE_MISSING');p=json.loads(file.read_text());require(p['target']=='wasm'and len(p['inputs'])==582,'CORE_INPUTS')
 for name,expected in p['inputs'].items():
  rel=PurePosixPath(name);require(not rel.is_absolute()and '..'not in rel.parts,'CORE_INPUT_PATH');file=ROOT/rel;require(file.is_file()and not file.is_symlink()and sha(file)==expected,'CORE_INPUT_BYTES')
 return {'core_provenance_sha256':sha(ROOT/'build/core/wasm/build-provenance.json'),'preferred_inputs':582,'core_transfer_artifact_sha256':CORE_ZIP}
def stage():
 source=ROOT/'build/web';require(source.is_dir(),'RUNTIME_BYTES')
 for file in source.rglob('*'):
  if file.is_dir():continue
  require(file.is_file()and not file.is_symlink(),'ARTIFACT_FILE_TYPE');target=BASE/'pages'/file.relative_to(source);target.parent.mkdir(parents=True,exist_ok=True)
  with target.open('xb')as out:out.write(file.read_bytes())
 binding=verify();binding.update(core_inputs());target=ROOT/'build/v060/frontend/live-public-proposal-v1';binding['helper_files']={name:sha(target/name)for name in ('breakout-launch-diagnostic.ts','breakout-launch-diagnostic.spec.ts','iphone-diagnostic.config.ts')};binding['policy_commit']=subprocess.check_output(['git','-C',str(ROOT.parent/'policy'),'rev-parse','HEAD'],text=True).strip()
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
 input_diagnostic=BASE/'input-diagnostic.json'
 if input_diagnostic.is_file():
  diagnostic=json.loads(input_diagnostic.read_text());require(diagnostic.get('phase')in {'prepare','stage','discover'}and diagnostic.get('safe_category')in CODES|{'UNCLASSIFIED_PRODUCER_FAILURE'},'CASE_IDENTITY');receipt.update(input_diagnostic={key:diagnostic[key]for key in ('phase','safe_category')},case_outcome='unrun')
 try:
  old=json.loads((BASE/'binding.json').read_text());current=verify();require(all(old[k]==v for k,v in current.items()),'POST_BINDING_DRIFT')
  if 'core_provenance_sha256'in old:require(all(old[k]==v for k,v in core_inputs().items()),'POST_BINDING_DRIFT')
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
if __name__=='__main__':
 mode=sys.argv[1]
 try:{'prepare':prepare,'stage':stage,'discover':discover,'report':report}[mode]()
 except Exception as error:
  if mode in {'prepare','stage','discover'}:
   BASE.mkdir(parents=True,exist_ok=True);category=str(error)if isinstance(error,ValueError)and str(error)in CODES else 'UNCLASSIFIED_PRODUCER_FAILURE'
   (BASE/'input-diagnostic.json').write_text(json.dumps({'phase':mode,'safe_category':category,'case_outcome':'unrun'})+'\n')
  raise SystemExit(1)

