#!/usr/bin/env python3
"""BGA Studio SFTP helper — reads credentials from .vscode/sftp.json.

Usage:
  bga_sftp.py ls [remote_dir]          — list remote files
  bga_sftp.py get <remote> <local>     — download file or directory (recursive)
  bga_sftp.py put <local...> <remote_dir> — upload files to remote dir
"""
import json
import os
import sys

import paramiko

CONFIG = os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".vscode", "sftp.json")


def load_config():
    with open(CONFIG) as f:
        cfg = json.load(f)
    return cfg


def connect():
    cfg = load_config()
    client = paramiko.SSHClient()
    client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
    kwargs = dict(
        hostname=cfg["host"],
        port=int(cfg.get("port", 22)),
        username=cfg["username"],
        timeout=15,
        allow_agent=False,
        look_for_keys=False,
    )
    if cfg.get("privateKeyPath"):
        kwargs["key_filename"] = os.path.expanduser(cfg["privateKeyPath"])
    elif cfg.get("password"):
        kwargs["password"] = cfg["password"]
    else:
        kwargs["allow_agent"] = kwargs["look_for_keys"] = True
    client.connect(**kwargs)
    return client.open_sftp()


def cmd_ls(sftp, path):
    for attr in sftp.listdir_attr(path):
        kind = "d" if attr.st_mode is not None and (attr.st_mode & 0o40000) else "-"
        print(f"{kind} {attr.filename}")


def cmd_get(sftp, remote, local):
    try:
        sftp.stat(remote)
    except IOError:
        print(f"remote not found: {remote}", file=sys.stderr)
        sys.exit(1)
    if _is_dir(sftp, remote):
        _get_dir(sftp, remote, local)
    else:
        os.makedirs(os.path.dirname(os.path.abspath(local)), exist_ok=True)
        sftp.get(remote, local)
        print(f"got {remote} -> {local}")


def cmd_put(sftp, local_paths, remote_dir):
    for local in local_paths:
        remote = remote_dir.rstrip("/") + "/" + os.path.basename(local)
        if os.path.isdir(local):
            _put_dir(sftp, local, remote)
        else:
            sftp.put(local, remote)
            print(f"put {local} -> {remote}")


def _is_dir(sftp, path):
    return (sftp.stat(path).st_mode & 0o40000) != 0


def _get_dir(sftp, remote, local):
    os.makedirs(local, exist_ok=True)
    for attr in sftp.listdir_attr(remote):
        r = remote.rstrip("/") + "/" + attr.filename
        l = os.path.join(local, attr.filename)
        if attr.st_mode is not None and (attr.st_mode & 0o40000):
            _get_dir(sftp, r, l)
        else:
            sftp.get(r, l)
    print(f"got {remote} -> {local}/")


def _put_dir(sftp, local, remote):
    try:
        sftp.mkdir(remote)
    except IOError:
        pass
    for name in os.listdir(local):
        p = os.path.join(local, name)
        r = remote.rstrip("/") + "/" + name
        if os.path.isdir(p):
            _put_dir(sftp, p, r)
        else:
            sftp.put(p, r)
    print(f"put {local}/ -> {remote}/")


def main():
    if len(sys.argv) < 2:
        print(__doc__)
        sys.exit(1)
    cmd, args = sys.argv[1], sys.argv[2:]
    sftp = connect()
    try:
        if cmd == "ls":
            cmd_ls(sftp, args[0] if args else ".")
        elif cmd == "get":
            cmd_get(sftp, args[0], args[1])
        elif cmd == "put":
            cmd_put(sftp, args[:-1], args[-1])
        else:
            print(__doc__)
            sys.exit(1)
    finally:
        sftp.close()


if __name__ == "__main__":
    main()
