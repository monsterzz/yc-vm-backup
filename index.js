const {Session} = require('yandex-cloud');
const {FunctionService} = require('yandex-cloud/api/serverless/functions/v1');
const {InstanceService, SnapshotService, Snapshot} = require('yandex-cloud/api/compute/v1');

const yc = new Session(),
    functionService = new FunctionService(yc),
    instanceService = new InstanceService(yc),
    snapshotService = new SnapshotService(yc);

module.exports.handler = async function (event, context) {
    let result = {};

    // get current folderId
    const currentFunction = await functionService.get({functionId: context.functionName});
    const folderId = currentFunction.folderId;

    // list instances in current folder
    const instances = await instanceService.list({
        folderId,
        pageSize: 1000,
    });

    let targetInstances = {};
    for (const instance of instances.instances) {
        if (instance.labels['backup-enabled'] !== 'true') {
            continue;
        }

        targetInstances[instance.id] = true;
        result[instance.id] = {
            instanceId: instance.id,
            instanceName: instance.name,
            diskId: instance.bootDisk.diskId,
        };
    }

    const snapshots = await snapshotService.list({folderId});
    for (const snapshot of snapshots.snapshots) {
        if (snapshot.labels['instance-id']) {
            const instanceId = snapshot.labels['instance-id'];
            if (targetInstances.hasOwnProperty(instanceId) && targetInstances[instanceId] === true) {
                if (snapshot.status === Snapshot.Status.CREATING || snapshot.status === Snapshot.Status.READY) {
                    const age = Date.now() - (snapshot.createdAt.seconds * 1000);
                    if (age > 1000 * 60 * 60 * 24) {
                        continue;
                    }

                    delete targetInstances[instanceId];
                    result[instanceId].status = snapshot.status;
                    result[instanceId].snapshotId = snapshot.id;
                    result[instanceId].age = age;
                }
            }
        }
    }

    for (const instanceId of Object.keys(targetInstances)) {
        const diskId = result[instanceId].diskId;
        const op = await snapshotService.create({
            folderId,
            diskId,
            name: `vm-backup-${instanceId}-${Math.round(Date.now() / 1000)}`,
            labels: {
                'instance-id': instanceId,
            },
        });
        result[instanceId].operationId = op.id;
    }

    return result;
};