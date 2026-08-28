import { adminClient, e2eCredentials } from './db';

/**
 * Manual cleanup for the dedicated E2E user + company.
 *
 * Deletes the E2E auth user (which cascades to its profile via the FK) and any
 * company created for it by name. Run after a suite run if you want to remove
 * test data from the backend:
 *
 *   npm run test:e2e:cleanup -- <email>
 *
 * The email defaults to the configured E2E_USER_EMAIL or the built-in default.
 */

async function main() {
  const credentials = e2eCredentials();
  const email = process.argv[2] || credentials.email;
  const admin = adminClient();

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const user = (users?.users || []).find((u) => u.email === email);

  if (user) {
    await admin.auth.admin.deleteUser(user.id);
    console.log(`Deleted auth user ${email}`);
  } else {
    console.log(`No auth user found for ${email}`);
  }

  const { data: companies } = await admin.from('companies').select('id, name');
  for (const comp of companies || []) {
    if (comp.name === credentials.companyName) {
      await admin.from('companies').delete().eq('id', comp.id);
      console.log(`Deleted company "${comp.name}"`);
    }
  }

  console.log('Cleanup complete.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
