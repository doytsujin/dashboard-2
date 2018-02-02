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

const app = require('../../lib/app')

describe('gardener', function () {
  describe('api', function () {
    describe('projects', function () {
      /* eslint no-unused-expressions: 0 */
      const oidc = nocks.oidc
      const k8s = nocks.k8s
      const name = 'foo'
      const namespace = `garden-${name}`
      const metadata = {name}
      const username = `${name}@example.org`
      const email = username
      const bearer = oidc.sign({email})
      const adminBearer = oidc.sign({email: 'admin@example.org'})
      const role = 'project'
      const owner = 'owner'
      const createdBy = 'createdBy'
      const description = 'description'
      const purpose = 'purpose'
      const data = {createdBy, owner, description, purpose}

      afterEach(function () {
        nocks.reset()
      })

      it('should return two projects', function () {
        oidc.stub.getKeys()
        k8s.stub.getProjects()
        return chai.request(app)
          .get('/api/namespaces')
          .set('authorization', `Bearer ${bearer}`)
          .catch(err => err.response)
          .then(res => {
            expect(res).to.have.status(200)
            expect(res).to.be.json
            expect(res.body).to.have.length(2)
          })
          .finally(() => nocks.verify())
      })

      it('should return all projects', function () {
        oidc.stub.getKeys()
        k8s.stub.getProjects()
        return chai.request(app)
          .get('/api/namespaces')
          .set('authorization', `Bearer ${adminBearer}`)
          .catch(err => err.response)
          .then(res => {
            expect(res).to.have.status(200)
            expect(res).to.be.json
            expect(res.body).to.have.length(3)
          })
          .finally(() => nocks.verify())
      })

      it('should create a project', function () {
        const createdBy = username
        const resourceVersion = 42
        oidc.stub.getKeys()
        k8s.stub.createProject({namespace, username, resourceVersion})
        return chai.request(app)
          .post('/api/namespaces')
          .set('authorization', `Bearer ${bearer}`)
          .send({metadata, data})
          .catch(err => err.response)
          .then(res => {
            expect(res).to.have.status(200)
            expect(res).to.be.json
            expect(res.body.metadata).to.eql({name, namespace, resourceVersion, role})
            expect(res.body.data).to.eql({createdBy, owner, description, purpose})
          })
          .finally(() => nocks.verify())
      })

      it('should patch a project', function () {
        const createdBy = 'bar@example.org'
        const resourceVersion = 43
        oidc.stub.getKeys()
        k8s.stub.patchProject({namespace, username, resourceVersion})
        return chai.request(app)
          .put(`/api/namespaces/${namespace}`)
          .set('authorization', `Bearer ${bearer}`)
          .send({metadata, data})
          .catch(err => err.response)
          .then(res => {
            expect(res).to.have.status(200)
            expect(res).to.be.json
            expect(res.body.metadata).to.eql({name, namespace, resourceVersion, role})
            expect(res.body.data).to.eql({createdBy, owner, description, purpose})
          })
          .finally(() => nocks.verify())
      })

      it('should delete a project', function () {
        oidc.stub.getKeys()
        k8s.stub.deleteProject({bearer, namespace, username})
        return chai.request(app)
          .delete(`/api/namespaces/${namespace}`)
          .set('authorization', `Bearer ${bearer}`)
          .catch(err => err.response)
          .then(res => {
            expect(res).to.have.status(200)
            expect(res).to.be.json
            expect(res.body).to.eql({metadata})
          })
          .finally(() => nocks.verify())
      })
    })
  })
})