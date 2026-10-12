import importlib.util,json,pathlib,tempfile,unittest,hashlib
from unittest.mock import patch
ROOT=pathlib.Path(__file__).resolve().parent
spec=importlib.util.spec_from_file_location('producer',ROOT/'producer.py');m=importlib.util.module_from_spec(spec);spec.loader.exec_module(m)
class Producer(unittest.TestCase):
 def setUp(self):
  self.tmp=tempfile.TemporaryDirectory();self.root=pathlib.Path(self.tmp.name);m.ROOT=self.root;m.BASE=self.root/'build/iphone-package-input';m.OUTPUT=self.root/'build/iphone-diagnostic-evidence';pages=m.BASE/'pages';pages.mkdir(parents=True)
  records=[]
  for i in range(11):
   name=f'assets/{i}.js';p=pages/name;p.parent.mkdir(exist_ok=True);p.write_bytes(f'publicruntime{i}'.encode());records.append({'path':name,'size':p.stat().st_size,'sha256':m.sha(p)})
  manifest={'runtime_sha256':m.RUNTIME,'source_commit':'9e7af75c0e2ad882e0eefbdb348e31f7fcd8711e','runtime_files':records};self.manifest=pages/'BUILD-MANIFEST.json';self.manifest.write_text(json.dumps(manifest));m.MANIFEST=m.sha(self.manifest)
  self.gpatch=patch.object(m,'git',side_effect=lambda *args:m.HEAD if args==('rev-parse','HEAD')else m.TREE if args==('rev-parse','HEAD^{tree}')else'');self.gpatch.start();self.env=patch.dict(m.os.environ,{'NOCPU_ROM_DIR':'','NOCPU_TEST_BASE_URL':''});self.env.start()
 def tearDown(self):self.gpatch.stop();self.env.stop();self.tmp.cleanup()
 def test_valid_exact_eleven(self):self.assertEqual(len(m.verify()['runtime_files']),11)
 def test_runtime_tamper(self):
  (m.BASE/'pages/assets/0.js').write_bytes(b'tamper')
  with self.assertRaisesRegex(ValueError,'RUNTIME_BYTES'):m.verify()
 def test_manifest_tamper(self):
  self.manifest.write_text('{}')
  with self.assertRaisesRegex(ValueError,'MANIFEST_DRIFT'):m.verify()
 def test_private_env_rejected(self):
  with patch.dict(m.os.environ,{'NOCPU_ROM_DIR':'private'}):
   with self.assertRaisesRegex(ValueError,'UNREVIEWED_INPUT'):m.verify()
 def test_dirty_source_rejected(self):
  with patch.object(m,'git',return_value='dirty'):
   with self.assertRaisesRegex(ValueError,'SOURCE_DRIFT'):m.verify()
 def test_archive_digest_rejected(self):
  (m.BASE/'evidence.zip').write_bytes(b'invalid')
  with self.assertRaisesRegex(ValueError,'ARTIFACT_DIGEST'):m.prepare()
 def test_missing_report_retains_safe_unknown(self):
  with self.assertRaises(SystemExit):m.report()
  r=json.loads((m.OUTPUT/'receipt.json').read_text());self.assertEqual(r['case_outcome'],'unknown');self.assertTrue(r['prior_failure_not_superseded']);self.assertNotIn('Traceback',json.dumps(r))
 def reportinput(self,title=None,status='failed'):
  binding=m.verify();binding['helper_files']={};(m.BASE/'binding.json').write_text(json.dumps(binding))
  folder=self.root/'build/iphone-launch-diagnostic-v1';folder.mkdir();matrix={'suites':[{'specs':[{'title':title or m.TITLE,'tests':[{'projectName':'iphone-emulated','results':[{'status':status}]}]}]}]};(folder/'matrix.json').write_text(json.dumps(matrix));return matrix
 def test_discovery_exact_one(self):
  matrix=self.reportinput();(m.BASE/'discovery.json').write_text(json.dumps(matrix));m.discover();self.assertEqual(json.loads((m.BASE/'discovery-proof.json').read_text())['discovered'],1)
 def test_discovery_wrongtitle(self):
  matrix=self.reportinput(title='SECRET_PAYLOAD');(m.BASE/'discovery.json').write_text(json.dumps(matrix))
  with self.assertRaisesRegex(ValueError,'DISCOVERY_IDENTITY'):m.discover()
 def test_discovery_extra_case(self):
  matrix=self.reportinput();matrix['suites']*=2;(m.BASE/'discovery.json').write_text(json.dumps(matrix))
  with self.assertRaisesRegex(ValueError,'DISCOVERY_IDENTITY'):m.discover()
 def test_unknown_title_not_serialized(self):
  self.reportinput(title='SECRET_PAYLOAD')
  with self.assertRaises(SystemExit):m.report()
  text=(m.OUTPUT/'receipt.json').read_text();self.assertNotIn('SECRET_PAYLOAD',text);self.assertIn('CASE_IDENTITY',text)
 def test_unknown_status_not_serialized(self):
  self.reportinput(status='SECRET_PAYLOAD')
  with self.assertRaises(SystemExit):m.report()
  self.assertNotIn('SECRET_PAYLOAD',(m.OUTPUT/'receipt.json').read_text())
 def test_unknown_exception_not_serialized(self):
  with patch.object(m,'verify',side_effect=ValueError('SECRET_PAYLOAD')):
   with self.assertRaises(SystemExit):m.report()
  self.assertNotIn('SECRET_PAYLOAD',(m.OUTPUT/'receipt.json').read_text())
 def test_late_copyfailure_preserves_actual_failed(self):
  self.reportinput()
  with patch.object(m.shutil,'copyfile',side_effect=OSError('private path')):
   with self.assertRaises(SystemExit):m.report()
  receipt=json.loads((m.OUTPUT/'receipt.json').read_text());self.assertEqual(receipt['case_outcome'],'failed');self.assertFalse(receipt['media_retained'])
 def test_atomic_late_rewrite_failure_preserves_actual(self):
  self.reportinput();original=m.os.replace;calls=[]
  def failsecond(*args):
   calls.append(args)
   if len(calls)>1:raise OSError('latewrite')
   return original(*args)
  with patch.object(m.os,'replace',side_effect=failsecond):
   with self.assertRaises(OSError):m.report()
  receipt=json.loads((m.OUTPUT/'receipt.json').read_text());self.assertEqual(receipt['case_outcome'],'failed');self.assertEqual(receipt['cases'][0]['profile'],'iphone-emulated');self.assertFalse(receipt['media_retained'])
 def test_nearcap_media_not_copied_total_bounded(self):
  self.reportinput();extra=self.root/'build/iphone-launch-diagnostic-v1/large.png'
  with extra.open('wb')as stream:stream.truncate(m.LIMIT-m.RECEIPT_LIMIT+1)
  with self.assertRaises(SystemExit):m.report()
  receipt=json.loads((m.OUTPUT/'receipt.json').read_text());self.assertEqual(receipt['case_outcome'],'failed');self.assertFalse(receipt['media_retained']);self.assertEqual(receipt['evidence_bound_category'],'EVIDENCE_OVER_8MIB');self.assertLessEqual(sum(p.stat().st_size for p in m.OUTPUT.rglob('*')if p.is_file()),m.LIMIT)
 def test_runtime_missing_audits_all_eleven(self):
  (m.BASE/'pages/assets/0.js').unlink()
  with self.assertRaisesRegex(ValueError,'RUNTIME_BYTES'):m.verify()
  audit=json.loads((m.BASE/'runtime-audit.json').read_text());self.assertEqual(len(audit['records']),11);self.assertFalse(audit['all_eleven_match']);self.assertFalse(audit['records'][0]['present'])
 def test_input_diagnostic_keeps_specific_phase_and_unrun(self):
  (m.BASE/'input-diagnostic.json').write_text(json.dumps({'phase':'stage','safe_category':'RUNTIME_BYTES','arbitrary':'SECRET_PAYLOAD'}))
  with self.assertRaises(SystemExit):m.report()
  receipt=json.loads((m.OUTPUT/'receipt.json').read_text());self.assertEqual(receipt['case_outcome'],'unrun');self.assertEqual(receipt['input_diagnostic'],{'phase':'stage','safe_category':'RUNTIME_BYTES'});self.assertNotIn('SECRET_PAYLOAD',json.dumps(receipt))
 def test_source_inputs_missing_rejected(self):
  with self.assertRaisesRegex(ValueError,'CORE_MISSING'):m.core_inputs()
if __name__=='__main__':unittest.main()
