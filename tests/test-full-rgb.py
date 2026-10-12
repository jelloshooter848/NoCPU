# SPDX-License-Identifier: GPL-3.0-or-later
import sys, tempfile, gzip, json, shutil, argparse, hashlib
from pathlib import Path
parser=argparse.ArgumentParser();parser.add_argument("--output",type=Path);args=parser.parse_args()
sys.path.insert(0, str((Path(__file__).resolve().parents[1] / 'tools/reference')))
from full_rgb import compare_rgb, compare_rgb_many

def fnv(data):
    h=14695981039346656037
    for b in data:h=((h^b)*1099511628211)&((1<<64)-1)
    return h

cases=[]
with tempfile.TemporaryDirectory(dir='/tmp',prefix='nocpu-rgb-negative-') as tmp:
    base=Path(tmp)/'baseline'; base.mkdir()
    data=bytes([0,255,71,91,16,32])
    (base/'frames.csv').write_text(f'frame,time_ps,fnv1a64\n0,10,{fnv(data)}\n')
    (base/'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,10,2,1\n')
    (base/'frames.rgb.gz').write_bytes(gzip.compress(data))
    assert compare_rgb(base,base)['decoded_bytes']==6; cases.append({'case':'identical','passed':True})
    for name in ['byte','truncated-frame','truncated-gzip','corrupt-trailer','missing','extra','wrong-hash','wrong-count','wrong-time','wrong-geometry']:
        target=Path(tmp)/name;shutil.copytree(base,target)
        p=target/'frames.rgb.gz'
        if name=='byte':p.write_bytes(gzip.compress(bytes([1])+data[1:]))
        elif name=='truncated-frame':p.write_bytes(gzip.compress(data[:-1]))
        elif name=='truncated-gzip':p.write_bytes(p.read_bytes()[:-4])
        elif name=='corrupt-trailer':
            raw=bytearray(p.read_bytes());raw[-8]^=1;p.write_bytes(raw)
        elif name=='missing':p.unlink()
        elif name=='extra':p.write_bytes(gzip.compress(data+b'x'))
        elif name=='wrong-hash':(target/'frames.csv').write_text('frame,time_ps,fnv1a64\n0,10,0\n')
        elif name=='wrong-count':(target/'frames.csv').write_text('frame,time_ps,fnv1a64\n')
        elif name=='wrong-time':(target/'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,11,2,1\n')
        elif name=='wrong-geometry':(target/'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,10,-2,1\n')
        try:compare_rgb(base,target)
        except (ValueError,OSError,EOFError) as error:cases.append({'case':name,'passed':True,'rejected_by':type(error).__name__})
        else:raise AssertionError(name)
    for name, changed_file, content in [
        ('equal-bad-hash','frames.csv','frame,time_ps,fnv1a64\n0,10,0\n'),
        ('equal-invalid-geometry','frame-geometry.csv','frame,time_ps,width,height\n0,10,-2,1\n'),
        ('equal-noncontiguous','frames.csv',f'frame,time_ps,fnv1a64\n1,10,{fnv(data)}\n'),
        ('equal-time-mismatch','frame-geometry.csv','frame,time_ps,width,height\n0,11,2,1\n')]:
        target=Path(tmp)/name;shutil.copytree(base,target);(target/changed_file).write_text(content)
        try:compare_rgb(target,target)
        except (ValueError,OSError,EOFError) as error:cases.append({'case':name,'passed':True,'rejected_by':type(error).__name__})
        else:raise AssertionError(name)
    multi=Path(tmp)/'valid-multiple';shutil.copytree(base,multi)
    (multi/'frames.csv').write_text(f'frame,time_ps,fnv1a64\n0,10,{fnv(data)}\n1,20,{fnv(data[::-1])}\n')
    (multi/'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,10,2,1\n1,20,1,2\n')
    (multi/'frames.rgb.gz').write_bytes(gzip.compress(data+data[::-1]))
    result=compare_rgb(multi,multi);assert result['frames']==2 and result['decoded_bytes']==12
    cases.append({'case':'valid-multiple-variable-geometry','passed':True})
    renderer=Path(tmp)/'renderer-identity.txt';renderer.write_bytes(b'synthetic independently frozen renderer')
    original=Path(tmp)/'original-renderer';shutil.copytree(base,original)
    (original/'frame-geometry.csv').write_text('frame,time_ps,width,height,contrast,p0\n0,10,2,1,4.5,1\n')
    contract={'renderer_sha256':hashlib.sha256(renderer.read_bytes()).hexdigest(),'first':{'width':'2','height':'1','contrast':'4.5','p0':'1'},'stable':{'width':'2','height':'1','contrast':'4.5','p0':'1'}}
    assert compare_rgb(original,base,require_renderer_geometry=False,original_geometry_contract=contract)['frames']==1
    cases.append({'case':'canonical-valid-mandatory-renderer-contract','passed':True})
    for name in ['canonical-missing-contract','strict-rejects-missing-projection','canonical-changed-projection','canonical-changed-contrast','canonical-changed-renderer','canonical-changed-byte','canonical-corrupt-trailer','canonical-changed-time','canonical-changed-width']:
        a=Path(tmp)/(name+'-original');b=Path(tmp)/(name+'-portable');shutil.copytree(original,a);shutil.copytree(base,b)
        kw={'require_renderer_geometry':False,'original_geometry_contract':contract}
        if name=='canonical-missing-contract':kw.pop('original_geometry_contract')
        elif name=='strict-rejects-missing-projection':kw={}
        elif name=='canonical-changed-projection':(a/'frame-geometry.csv').write_text('frame,time_ps,width,height,contrast,p0\n0,10,2,1,4.5,2\n')
        elif name=='canonical-changed-contrast':(a/'frame-geometry.csv').write_text('frame,time_ps,width,height,contrast,p0\n0,10,2,1,1,1\n')
        elif name=='canonical-changed-renderer':kw['original_geometry_contract']={**contract,'renderer_sha256':'0'*64}
        elif name=='canonical-changed-byte':(b/'frames.rgb.gz').write_bytes(gzip.compress(bytes([1])+data[1:]))
        elif name=='canonical-corrupt-trailer':
            raw=bytearray((b/'frames.rgb.gz').read_bytes());raw[-8]^=1;(b/'frames.rgb.gz').write_bytes(raw)
        elif name=='canonical-changed-time':(b/'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,11,2,1\n')
        elif name=='canonical-changed-width':(b/'frame-geometry.csv').write_text('frame,time_ps,width,height\n0,10,3,1\n')
        try:compare_rgb(a,b,**kw)
        except (ValueError,OSError,EOFError) as error:cases.append({'case':name,'passed':True,'rejected_by':type(error).__name__})
        else:raise AssertionError(name)
    assert compare_rgb_many(base,[base,base,base])['compared_streams']==4
    cases.append({'case':'many-streams-valid','passed':True})
    for name, peers in [('many-streams-third-byte',[base,Path(tmp)/'byte',base]),('many-streams-third-trailer',[base,Path(tmp)/'corrupt-trailer',base]),('many-streams-empty',[])]:
        try:compare_rgb_many(base,peers)
        except (ValueError,OSError,EOFError) as error:cases.append({'case':name,'passed':True,'rejected_by':type(error).__name__})
        else:raise AssertionError(name)
if args.output:
    args.output.parent.mkdir(parents=True,exist_ok=True)
    args.output.write_text(json.dumps({'cases':cases,'passed':len(cases),'failed':0,'scope':'synthetic meaningful negative tests; no actual gameplay claim'},indent=2)+'\n')
print(json.dumps({'passed':len(cases),'failed':0}))
