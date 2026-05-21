# Pet Reminders And Folder Design

Always Here adds pet reminder bubbles for four reminder classes: hourly time,
water, sedentary, and work-time reminders. Each class can enable a system
notification independently. Water and sedentary reminders have configurable
minute intervals, clamped to a safe minimum of 5 minutes.

The pet widget owns visible bubbles and reminder scheduling. It uses a small
testable reminder rules module to normalize settings and decide when a reminder
is due. System notifications go through the Electron main process via IPC.

The pet folder is configurable from settings with an OS folder picker. The app
defaults to `%USERPROFILE%\.codex\pets`, but after the user picks a folder,
Always Here stores `config.petFolderPath` and scans that directory for
Codex-format pet packages.
