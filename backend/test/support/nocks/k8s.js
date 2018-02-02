//
// Copyright 2018 by The Gardener Authors.
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//      http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//

'use strict'

const _ = require('lodash')
const nock = require('nock')
const yaml = require('js-yaml')

const { credentials } = require('../../../lib/kubernetes')
const { encodeBase64 } = require('../../../lib/utils')
const clientConfig = credentials()
const url = clientConfig.url
const auth = clientConfig.auth

const seedList = [
  getSeed('aws', 'eu-west-1'),
  getSeed('aws', 'eu-central-1'),
  getSeed('google', 'europe-west1')
]

const projectList = [
  getProject('foo', 'foo@example.org', 'bar@example.org', 'foo-description', 'foo-purpose'),
  getProject('bar', 'bar@example.org', 'foo@example.org', 'bar-description', 'bar-purpose'),
  getProject('secret', 'admin@example.org', 'admin@example.org', 'secret-description', 'secret-purpose')
]

const shootList = [
  getShoot({name: 'fooShoot', project: 'fooProject', createdBy: 'fooCreator', purpose: 'fooPurpose', infrastructureSecretName: 'fooSecretName'}),
  getShoot({name: 'barShoot', project: 'fooProject', createdBy: 'barCreator', purpose: 'barPurpose', infrastructureSecretName: 'barSecretName'}),
  getShoot({name: 'dummyShoot', project: 'fooProject', createdBy: 'fooCreator', purpose: 'fooPurpose', infrastructureSecretName: 'barSecretName'})
]

const infrastructureSecretsList = [
  getInfrastructureSecret('foo', 'secret1', 'infra1'),
  getInfrastructureSecret('foo', 'secret2', 'infra1'),
  getInfrastructureSecret('foo', 'secret3', 'infra2')
]

const projectMembersList = [
  getProjectMembers('garden-foo', ['foo@example.org', 'bar@example.org']),
  getProjectMembers('garden-bar', ['bar@example.org', 'foo@example.org']),
  getProjectMembers('garden-secret', ['admin@example.org'])
]

const certificateAuthorityData = encodeBase64('certificate-authority-data')
const clientCertificateData = encodeBase64('client-certificate-data')
const clientKeyData = encodeBase64('client-key-data')

function getSeed (kind, region, data = {}) {
  return {
    metadata: {
      name: `${kind}---${region}`,
      labels: {
        'infrastructure.garden.sapcloud.io/kind': kind,
        'infrastructure.garden.sapcloud.io/region': region
      },
      annotations: {
        'dns.garden.sapcloud.io/domain': `${region}.${kind}.example.org`
      }
    },
    data
  }
}

function getProjectMembers (namespace, users) {
  const apiGroup = 'rbac.authorization.k8s.io'
  return {
    metadata: {
      name: 'garden-project-members',
      namespace,
      labels: {
        'garden.sapcloud.io/role': 'members'
      }
    },
    roleRef: {
      apiGroup,
      kind: 'ClusterRole',
      name: 'garden-project-member'
    },
    subjects: _.map(users, name => {
      return {
        apiGroup,
        kind: 'User',
        name
      }
    })
  }
}

function getInfrastructureSecret (project, name, kind, data = {}) {
  return {
    metadata: {
      labels: {
        'garden.sapcloud.io/role': 'infrastructure',
        'infrastructure.garden.sapcloud.io/kind': kind
      },
      name,
      namespace: `garden-${project}`
    },
    data
  }
}

function getProject (name, owner, createdBy, description, purpose) {
  return {
    metadata: {
      name: `garden-${name}`,
      labels: {
        'garden.sapcloud.io/role': 'project',
        'project.garden.sapcloud.io/name': name
      },
      annotations: {
        'project.garden.sapcloud.io/createdBy': createdBy,
        'project.garden.sapcloud.io/owner': owner,
        'project.garden.sapcloud.io/description': description,
        'project.garden.sapcloud.io/purpose': purpose
      }
    }
  }
}

function getShoot ({
  name,
  project,
  createdBy,
  purpose = 'foo-purpose',
  kind = 'fooInfra',
  region = 'foo-west',
  infrastructureSecretName = 'foo-secret'
}) {
  const shoot = {
    metadata: {
      name,
      namespace: `garden-${project}`,
      annotations: {
        'garden.sapcloud.io/purpose': purpose
      }
    },
    spec: {
      infrastructure: {
        kind,
        region,
        secret: infrastructureSecretName
      }
    }
  }
  if (createdBy) {
    shoot.metadata.annotations['garden.sapcloud.io/createdBy'] = createdBy
  }
  return shoot
}

function getKubeconfig ({server, name}) {
  const cluster = {
    'certificate-authority-data': certificateAuthorityData,
    server
  }
  const user = {
    'client-certificate-data': clientCertificateData,
    'client-key-data': clientKeyData
  }
  const context = {
    cluster: name,
    user: name
  }
  return yaml.safeDump({
    kind: 'Config',
    clusters: [{cluster, name}],
    contexts: [{context, name}],
    users: [{user, name}],
    'current-context': name
  })
}

function authorizationHeader (bearer) {
  const authorization = `Bearer ${bearer}`
  return {authorization}
}

const stub = {
  getSeeds ({bearer = auth.bearer} = {}) {
    return nock(url)
      .matchHeader('authorization', new RegExp(`bearer ${bearer}`, 'i'))
      .get('/api/v1/namespaces/garden/secrets')
      .query({
        labelSelector: 'garden.sapcloud.io/role=seed'
      })
      .reply(200, {
        items: seedList
      })
  },
  getShoots ({bearer, namespace}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots`)
      .reply(200, {
        items: shootList
      })
  },
  getShoot ({bearer, namespace, name, project, createdBy, purpose, kind, region, infrastructureSecretName}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots/${name}`)
      .reply(200, getShoot({name, project, createdBy, purpose, kind, region, infrastructureSecretName}))
  },
  createShoot ({bearer, namespace, spec, resourceVersion = 42}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const metadata = {
      resourceVersion,
      namespace
    }
    const result = {metadata, spec}

    return nock(url, {reqheaders})
      .post(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots`, body => {
        _.assign(metadata, body.metadata)
        return true
      })
      .reply(200, () => result)
  },
  deleteShoot ({bearer, namespace, name, project, createdBy, purpose, kind, region, infrastructureSecretName, deletionTimestamp, resourceVersion = 42}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }

    const metadata = {
      resourceVersion,
      namespace
    }
    const shoot = getShoot({name, project, createdBy, purpose, kind, region, infrastructureSecretName, deletionTimestamp})
    shoot.metadata.deletionTimestamp = deletionTimestamp
    const result = {metadata}
    return nock(url, {reqheaders})
      .delete(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots/${name}`)
      .reply(200)
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots/${name}`)
      .reply(200, shoot)
      .patch(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots/${name}`, body => {
        _.assign(metadata, body.metadata)
        return true
      })
      .reply(200, () => result)
  },
  getShootInfo ({bearer, namespace, name, project, kind, region, seedClusterName, shootServerUrl, shootUser, shootPassword}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const adminReqheaders = {
      authorization: `Bearer ${auth.bearer}`
    }

    const seedServerUrl = 'https://seed.foo.bar:443'
    const seedData = {
      kubeconfig: encodeBase64(getKubeconfig({
        server: seedServerUrl,
        name: seedClusterName
      }))
    }
    const shootData = {
      kubeconfig: encodeBase64(getKubeconfig({
        server: shootServerUrl,
        name: 'shoot.foo.bar'
      })),
      username: encodeBase64(shootUser),
      password: encodeBase64(shootPassword)
    }
    nock(url, {reqheaders})
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots/${name}`)
      .reply(200, getShoot({name, project, kind, region}))

    nock(url, {reqheaders: adminReqheaders})
      .get('/api/v1/namespaces/garden/secrets')
      .query({
        labelSelector: [
          'garden.sapcloud.io/role=seed',
          `infrastructure.garden.sapcloud.io/kind=${kind}`,
          `infrastructure.garden.sapcloud.io/region=${region}`
        ].join(',')
      })
      .reply(200, {items: [getSeed(kind, region, seedData)]})

    return nock(seedServerUrl)
      .get(`/api/v1/namespaces/shoot-${namespace}-${name}/secrets/kubecfg`)
      .reply(200, {data: shootData})
  },
  getInfrastructureSecrets ({bearer, namespace}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/api/v1/namespaces/${namespace}/secrets`)
      .query({
        labelSelector: 'garden.sapcloud.io/role=infrastructure'
      })
      .reply(200, {
        items: infrastructureSecretsList
      })
  },
  getInfrastructureSecret ({bearer, namespace, project, kind, name, data}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/api/v1/namespaces/${namespace}/secrets/${name}`)
      .reply(200, getInfrastructureSecret(project, name, kind, data))
  },
  createInfrastructureSecret ({bearer, namespace, data, resourceVersion = 42}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const metadata = {
      resourceVersion,
      namespace
    }
    const result = {metadata, data}

    return nock(url, {reqheaders})
      .post(`/api/v1/namespaces/${namespace}/secrets`, body => {
        _.assign(metadata, body.metadata)
        return true
      })
      .reply(200, () => result)
  },
  patchInfrastructureSecret ({bearer, namespace, project, kind, name, data}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .patch(`/api/v1/namespaces/${namespace}/secrets/${name}`)
      .reply(200, getInfrastructureSecret(project, name, kind, data))
  },
  deleteInfrastructureSecret ({bearer, namespace, project, name}) {
    const fooShoot = getShoot({name: 'fooShoot', project, infrastructureSecretName: 'someOtherSecretName'})

    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots`)
      .reply(200, {
        items: [fooShoot]
      })
      .delete(`/api/v1/namespaces/${namespace}/secrets/${name}`)
      .reply(200)
  },
  deleteInfrastructureSecretReferencedByShoot ({bearer, namespace, project, infrastructureSecretName}) {
    const referencingShoot = getShoot({name: 'referencingShoot', project, infrastructureSecretName})
    const fooShoot = getShoot({name: 'fooShoot', project, infrastructureSecretName: 'someOtherSecretName'})

    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots`)
      .reply(200, {
        items: [fooShoot, referencingShoot]
      })
  },
  getProjects () {
    const reqheaders = {
      authorization: `Bearer ${auth.bearer}`
    }
    const subject = {
      kind: 'User',
      name: 'admin@example.org'
    }
    const subjects = [subject]
    return nock(url, {reqheaders})
      .get('/api/v1/namespaces')
      .query({
        labelSelector: 'garden.sapcloud.io/role=project'
      })
      .reply(200, {
        items: projectList
      })
      .get('/apis/rbac.authorization.k8s.io/v1beta1/rolebindings')
      .query({
        labelSelector: 'garden.sapcloud.io/role=members'
      })
      .reply(200, {
        items: projectMembersList
      })
      .get('/apis/rbac.authorization.k8s.io/v1beta1/clusterrolebindings/garden-administrators')
      .reply(200, {subjects})
  },
  createProject ({namespace, username, resourceVersion = 42}) {
    const bearer = auth.bearer
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const roleBindingsUrl = `/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings`
    const metadata = {
      resourceVersion
    }
    const result = {metadata}

    function matchRolebindingProjectMembers ({metadata, roleRef, subjects: [subject]}) {
      return metadata.name === 'garden-project-members' &&
        roleRef.name === 'garden-project-member' &&
        subject.name === username
    }

    function matchRolebindingTerraformers ({metadata, roleRef, subjects: [subject]}) {
      return metadata.name === 'garden-terraformers' &&
        roleRef.name === 'garden-terraformer' &&
        subject.namespace === namespace
    }

    return nock(url, {reqheaders})
      .post(roleBindingsUrl, matchRolebindingProjectMembers)
      .reply(200)
      .post(roleBindingsUrl, matchRolebindingTerraformers)
      .reply(200)
      .post('/api/v1/namespaces', body => {
        _.assign(metadata, body.metadata)
        return true
      })
      .reply(200, () => result)
  },
  patchProject ({namespace, username, resourceVersion = 43}) {
    const bearer = auth.bearer
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const result = _
      .chain(projectList)
      .find(({metadata}) => metadata.name === namespace)
      .set('metadata.resourceVersion', resourceVersion)
      .value()
    const {metadata} = result
    return nock(url, {reqheaders})
      .patch(`/api/v1/namespaces/${namespace}`, body => {
        _.merge(metadata, body.metadata)
        return true
      })
      .reply(200, () => result)
  },
  deleteProject ({bearer, namespace, username}) {
    nock(url, {reqheaders: authorizationHeader(bearer)})
      .get(`/apis/garden.sapcloud.io/v1/namespaces/${namespace}/shoots`)
      .reply(200, {
        items: []
      })
      .get(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`)
      .reply(200, getProjectMembers(namespace, [username, 'foo@example.org']))
    return nock(url, {reqheaders: authorizationHeader(auth.bearer)})
      .delete(`/api/v1/namespaces/${namespace}`)
      .reply(200)
  },
  getMembers ({bearer, namespace, members}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    return nock(url, {reqheaders})
      .get(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`)
      .reply(200, getProjectMembers(namespace, members))
  },
  addMember ({bearer, namespace, newMember, members}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const oldProjectMembers = getProjectMembers(namespace, members)
    const newProjectMembers = getProjectMembers(namespace, _.concat(members, newMember))

    const result = newProjectMembers
    return nock(url, {reqheaders})
      .get(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`)
      .reply(200, oldProjectMembers)
      .patch(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`, body => {
        result.metadata = body.metadata
        return true
      })
      .reply(200, () => result)
  },
  notAddMember ({bearer, namespace, members}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const projectMembers = getProjectMembers(namespace, members)

    return nock(url, {reqheaders})
      .get(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`)
      .reply(200, projectMembers)
  },
  removeMember ({bearer, namespace, removeMember, members}) {
    const reqheaders = {
      authorization: `Bearer ${bearer}`
    }
    const oldProjectMembers = getProjectMembers(namespace, members)
    const newProjectMembers = getProjectMembers(namespace, _.without(members, removeMember))

    const result = newProjectMembers
    return nock(url, {reqheaders})
      .get(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`)
      .reply(200, oldProjectMembers)
      .patch(`/apis/rbac.authorization.k8s.io/v1beta1/namespaces/${namespace}/rolebindings/garden-project-members`, body => {
        result.metadata = body.metadata
        return true
      })
      .reply(200, () => result)
  }
}
module.exports = {
  url,
  projectList,
  projectMembersList,
  seedList,
  auth,
  stub
}