#!/usr/bin/env python3
# SPDX-License-Identifier: GPL-3.0-or-later
"""Read-only fresh original nall configuration boundary before a capture.

Run inside the normal pinned disposable container with /artifacts writable.
It neither repurposes HOME nor writes the original settings directory.
It also records whether the host CPU has FMA. llvmpipe fuses its viewport
multiply-add only on FMA hosts, and the portable renderer reproduces that fused
rasterization, so a capture on a host without FMA is refused.
"""
import json,os,pathlib,pwd
userinfo=pwd.getpwuid(os.getuid())
config=pathlib.Path(userinfo.pw_dir)/'.config'/'dice'
contents=sorted(item.name for item in config.iterdir()) if config.is_dir() else []
empty=not config.is_symlink() and (not config.exists() or (config.is_dir() and not contents))
receipt={'uid':os.getuid(),'gid':os.getgid(),'passwd_home':userinfo.pw_dir,
         'observed_HOME':os.environ.get('HOME'),'HOME_override_applied':False,
         'original_nall_config_path':str(config),'config_existed_before_launch':config.exists(),
         'config_entries_before_launch':contents,'fresh_original_config_empty':empty,
         'config_derivation':'original Linux getpwuid(getuid()).pw_dir + /.config/dice; no HOME or XDG lookup'}
flags=set()
for line in pathlib.Path('/proc/cpuinfo').read_text().splitlines():
 if line.startswith('flags'):flags|=set(line.split(':',1)[1].split())
receipt['host_cpu_fma']='fma' in flags
with open('/artifacts/container-environment.json','x') as stream:
 stream.write(json.dumps(receipt,indent=2)+'\n')
if not empty:raise SystemExit('Fresh original nall configuration directory is not empty')
if not receipt['host_cpu_fma']:
 raise SystemExit('Host CPU lacks FMA: llvmpipe would rasterize unfused, unlike the reference the portable renderer reproduces')
