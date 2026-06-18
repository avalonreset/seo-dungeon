const remoteProtocol = Object.freeze({
  protocol: 2,
  allowedTypes: Object.freeze([
    'audit',
    'fix',
    'commit',
    'narrate',
    'chat',
    'cancel',
    'steer',
    'open-folder',
    'capabilities',
    'remote-command',
    'remote-command-claim',
    'session-event',
    'session-state',
  ]),
  reservedSessionEventKinds: Object.freeze([
    'remote-command',
  ]),
  terminalLedgerResultStatuses: Object.freeze([
    'complete',
    'completed',
    'done',
    'error',
    'failed',
    'cancelled',
    'canceled',
    'interrupted',
  ]),
});

module.exports = remoteProtocol;
