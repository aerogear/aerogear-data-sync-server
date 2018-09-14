const axios = require('axios')
const realmToImport = require('./config/realm-export.json')
const { log } = require('../server/lib/util/logger')

const config = {
  ...require(process.env.KEYCLOAK_CONFIG_FILE),
  adminRealmName: 'master',
  resource: 'admin-cli',
  username: 'admin',
  password: 'admin',
  token: undefined
}

const usersConfiguration = [
  { name: 'test-admin', realmRole: 'admin', clientId: 'sync-server', clientRoleName: 'admin' },
  { name: 'test-voter', realmRole: 'voter', clientId: 'sync-server', clientRoleName: 'voter' },
  { name: 'test-voter2', realmRole: 'voter', clientId: 'sync-server', clientRoleName: 'voter' },
  { name: 'test-realm-role', realmRole: 'admin' },
  { name: 'test-norole' }
]

async function authenticateKeycloak () {
  const res = await axios({
    method: 'POST',
    url: `${config['auth-server-url']}/realms/${config.adminRealmName}/protocol/openid-connect/token`,
    data: `client_id=${config.resource}&username=${config.username}&password=${config.password}&grant_type=password`
  }).catch((err) => { return log.error(err) })
  return `Bearer ${res.data['access_token']}`
}

async function importRealm () {
  await axios({
    method: 'POST',
    url: `${config['auth-server-url']}/admin/realms`,
    data: realmToImport,
    headers: {'Authorization': config.token, 'Content-Type': 'application/json'}
  }).catch((err) => { return log.error(err) })
}

async function getRealmRoles () {
  const res = await axios({
    method: 'GET',
    url: `${config['auth-server-url']}/admin/realms/${config.realm}/roles`,
    headers: {'Authorization': config.token}
  }).catch((err) => { return log.error(err) })

  return res.data
}

async function getClients () {
  const res = await axios({
    method: 'GET',
    url: `${config['auth-server-url']}/admin/realms/${config.realm}/clients`,
    headers: {'Authorization': config.token}
  }).catch((err) => { return log.error(err) })

  return res.data
}

async function getClientRoles (client) {
  const res = await axios({
    method: 'GET',
    url: `${config['auth-server-url']}/admin/realms/${config.realm}/clients/${client.id}/roles`,
    headers: {'Authorization': config.token}
  }).catch((err) => { return log.error(err) })
  return res.data
}

async function createUser (name) {
  const res = await axios({
    method: 'post',
    url: `${config['auth-server-url']}/admin/realms/${config.realm}/users`,
    data: {
      'username': name,
      'credentials': [{'type': 'password', 'value': config.password, 'temporary': false}],
      'enabled': true
    },
    headers: {'Authorization': config.token, 'Content-Type': 'application/json'}
  }).catch((err) => { return log.error(err) })

  return res.headers.location
}

async function assignRealmRoleToUser (userIdUrl, role) {
  const res = await axios({
    method: 'POST',
    url: `${userIdUrl}/role-mappings/realm`,
    data: [role],
    headers: {'Authorization': config.token, 'Content-Type': 'application/json'}
  }).catch((err) => { return log.error(err) })

  return res.data
}

async function assignClientRoleToUser (userIdUrl, client, role) {
  const res = await axios({
    method: 'POST',
    url: `${userIdUrl}/role-mappings/clients/${client.id}`,
    data: [role],
    headers: {'Authorization': config.token, 'Content-Type': 'application/json'}
  }).catch((err) => { return log.error(err) })
  return res.data
}

async function prepareKeycloak () {
  config.token = await authenticateKeycloak()
  await importRealm()
  const realmRoles = await getRealmRoles()
  const clients = await getClients()

  usersConfiguration.forEach(async user => {
    // Create a new user
    const userIdUrl = await createUser(user.name)
    // Assign realm role to user
    if (user.realmRole) {
      const selectedRealmRole = realmRoles.find(role => role.name === user.realmRole)
      await assignRealmRoleToUser(userIdUrl, selectedRealmRole)
    }
    // Assign client role to user
    if (user.clientId && user.clientRoleName) {
      const selectedClient = clients.find(client => client.clientId === user.clientId)
      const clientRoles = await getClientRoles(selectedClient)
      const selectedClientRole = clientRoles.find(clientRole => clientRole.name === user.clientRoleName)
      await assignClientRoleToUser(userIdUrl, selectedClient, selectedClientRole)
    }
  })
}

async function resetKeycloakConfiguration () {
  await axios({
    method: 'DELETE',
    url: `${config['auth-server-url']}/admin/realms/${config.realm}`,
    headers: {'Authorization': config.token}
  }).catch((err) => { return log.error(err) })
}

module.exports = {
  prepareKeycloak,
  resetKeycloakConfiguration
}
