## Steadier automatic tests on GitHub (2026-10-22)

- Fixed the automatic tests getting stuck for half an hour while downloading the test browsers, which cancelled the run and held back the automatic publish. The browsers are now kept between runs, and the download gets 6 minutes per try with one retry.
