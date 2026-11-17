# The project lock

`init`, `add`, `remove`, `update` and `uninstall` take a single-writer lock, `pharn/.lock`, before they
read `pharn.config.json` or touch the network, and hold it to their last write, across their prompts. A
second writer refuses rather than queues (see
[Another pharn process is running](../troubleshooting.md#another-pharn-process-is-running)). `--dry-run`,
`pharn list` and `pharn status` never take it, so `pharn status --strict` stays runnable in CI while an
update is in flight. The refusal always says the holder "may be waiting for input in another terminal":
the lock does not record whether its holder sits at a prompt.

## Why it exists

Two concurrent runs do not merely race on a file: they corrupt the drift baseline. Process A overwrites a
file; process B, which planned against the pre-A snapshot, overwrites it again and records its own hash; A
then persists its records and config last, recording a hash for bytes B replaced.
[`pharn.records.json`](pharn-records.md) then disagrees with disk, and nothing in it shows that, so `update`
loses its ability to tell "pharn wrote this" from "you edited this".

## If the lock outlives its owner

Every writing command holds the lock across its prompts, so a walked-away prompt (`init`'s summary or
overwrite question, `update`'s or `uninstall`'s confirmation, the `add` or `remove` picker) blocks other
writers in that project until it is answered or cancelled. That is deliberate, as git holds its index lock:
the command plans once, and what you confirm is what it writes. An edit you make while a prompt is open is
never lost: `init` backs the file up before it overwrites it, and `update` stops before writing anything
(see [update: edits made while it waits](../commands/update.md#edits-made-while-update-waits-for-your-answer)).

An interrupted run releases the lock on its way out. That covers Ctrl-C, and a `timeout` or `docker stop`,
which arrive as `SIGINT` and `SIGTERM`. The run still exits 130 or 143 and prints that the project may be
partially updated. Three things cannot release the lock:

- a run that is `SIGKILL`ed;
- one that loses power;
- one ended by a hangup (`SIGHUP`, a closed terminal).

The hangup case is deliberate: listening for it would override `nohup`, and a `nohup pharn update` would
then stop mid-write. `pharn` breaks such a lock by itself when any of these hold:

- the file is missing, unreadable, or not a well-formed lock payload, and has not been modified in the last
  10 seconds (a lock is briefly empty while its owner writes it);
- its start time is more than five minutes in the future (no running `pharn` writes that; it is treated like
  a malformed payload);
- it comes from **another host** and is more than six hours old;
- it names a pid on **this** host that is no longer running;
- it comes from **this** host and started before this host last booted.

A lock from **this** host is never broken by age: while its pid is running, `pharn` refuses, however long
ago it started (a prompt left open over lunch keeps the project). A lock from **another host** is only
retired by age, since a pid means nothing across machines. If you are certain nothing is running, deleting
`pharn/.lock` is safe and is the documented escape.

**A recycled pid keeps a dead run's lock alive until the next reboot.** "No longer running" is checked by
asking the operating system whether that pid exists. If the run that took the lock was killed and its pid
has since been reused by an unrelated process, the lock reads as live, so `pharn` keeps refusing until this
host reboots. If the refusal names a pid that is not a `pharn` process (check with `ps -p <pid>`), delete
`pharn/.lock`.

**The boot check trusts the clock.** On a machine with no battery-backed clock, or one whose clock is
corrected forward by a long way after it boots, a running `pharn` can look as if it started before boot, and
another run on the same machine may then break its lock; corrections under five minutes are tolerated. A
clock set **back** by more than five minutes makes a running lock look as if it started in the future, and
it is then broken after 10 seconds like a malformed one. "This host" means the machine's hostname: if it
changes while `pharn` runs (macOS can rename itself when the network changes), the lock is treated as one
from another host (retired after six hours) and the run cannot remove it when it finishes, so delete
`pharn/.lock` yourself if no `pharn` is running.

**A directory named `pharn/.lock`** is never a lock (`pharn` does not create one), so it is refused with its
own message rather than broken:

```text
pharn/.lock is a directory, not a pharn lock file. pharn will not move or delete it, and cannot take the project lock while it is there.
Remove it yourself (or rename it) and re-run.
```

**A file named `pharn/.lock.<pid>.<hex>`** is what is left when a `pharn` run is killed (`kill -9`, a power
cut) in the instant it breaks a stale lock: it moves the old lock to that name, checks it, and deletes it.
`pharn` never reads such a file and never deletes a name it did not just create, so it stays until you
delete it. It is safe to delete when no `pharn` command is running.

**Do not run two `pharn` versions in one project at the same time.** `pharn` 0.13.0 and older lock a
different file, so neither sees the other's lock.

**`pharn` must be a real directory.** The lock, the backups and the install all live under `pharn/`, which a
writing command creates when it is missing (and removes again if nothing ended up in it). A `pharn` that is
a symbolic link, or a regular file, is refused before anything is written:

```text
pharn is a symbolic link. pharn keeps its lock, backups and install under pharn/ and will not write through a link that may point outside the project.
Replace it with a real directory and re-run.
```
