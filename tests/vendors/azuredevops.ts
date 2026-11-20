// Azure DevOps service hooks ("Web Hooks" consumer), as documented (learn.microsoft.com/azure/devops/service-hooks/
// services/webhooks, /events): Azure DevOps posts to Curahold, so this "mock" is the sender: event bodies in the
// documented shape (eventType, resource, resourceContainers) with the subscription's basic authentication. Curahold
// makes no call to Azure DevOps, so there is nothing to answer and no fault to arm on its side.
export const ADO_ORG = 'https://dev.azure.com/quillfield/';

const containers = { collection: { id: 'c0', baseUrl: ADO_ORG }, account: { id: 'a0', baseUrl: ADO_ORG }, project: { id: 'p0', baseUrl: ADO_ORG } };
const repository = { id: 'r1', name: 'web', url: `${ADO_ORG}_apis/git/repositories/r1`, remoteUrl: `${ADO_ORG}Portal/_git/web`, project: { id: 'p0', name: 'Portal' } };

export const adoPush = (key: string) => ({
  subscriptionId: 's1', notificationId: 1, id: 'e1', eventType: 'git.push', publisherId: 'tfs',
  message: { text: 'Ada pushed to web' }, detailedMessage: { text: '' },
  resource: { commits: [{ commitId: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', author: { name: 'Ada Demo' }, comment: `Fix the export button ${key}`, url: `${ADO_ORG}_apis/git/repositories/r1/commits/a1b2c3d4` }], refUpdates: [{ name: `refs/heads/feature/${key}-export`, oldObjectId: '0000000000000000000000000000000000000000', newObjectId: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }], repository, pushedBy: { displayName: 'Ada Demo', uniqueName: 'ada@demo.example' }, pushId: 14, date: '2026-11-20T08:00:00Z' },
  resourceContainers: containers, createdDate: '2026-11-20T08:00:01Z',
});

export const adoPr = (key: string, eventType: 'git.pullrequest.created' | 'git.pullrequest.updated' | 'git.pullrequest.merged', status: 'active' | 'completed' | 'abandoned') => ({
  subscriptionId: 's1', notificationId: 2, id: 'e2', eventType, publisherId: 'tfs',
  resource: { repository, pullRequestId: 7, status, createdBy: { displayName: 'Ada Demo', uniqueName: 'ada@demo.example' }, title: 'Export button works again', description: `Fixes ${key}`, sourceRefName: `refs/heads/feature/${key}-export`, targetRefName: 'refs/heads/main', mergeStatus: 'succeeded', lastMergeSourceCommit: { commitId: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678' }, _links: { web: { href: `${ADO_ORG}Portal/_git/web/pullrequest/7` } } },
  resourceContainers: containers, createdDate: '2026-11-20T08:05:00Z',
});

export const adoBuild = (result: 'succeeded' | 'failed') => ({
  subscriptionId: 's1', notificationId: 3, id: 'e3', eventType: 'build.complete', publisherId: 'tfs',
  resource: { id: 55, buildNumber: '20261120.1', status: 'completed', result, sourceBranch: 'refs/heads/feature/x', sourceVersion: 'a1b2c3d4e5f60718293a4b5c6d7e8f9012345678', definition: { id: 1, name: 'web-ci' }, repository: { id: 'r1', name: 'web', type: 'TfsGit' }, project: { id: 'p0', name: 'Portal' } },
  resourceContainers: containers,
});

export const adoAuth = (secret: string) => `Basic ${btoa(`azure:${secret}`)}`;
