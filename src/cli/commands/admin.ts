/**
 * `gateway admin` command group.
 *
 * Sub-commands:
 *   gateway admin create --email <> --password <> [--name <>]
 *   gateway admin list
 */

import { loadEnv, ensureDb, ok, fail, printTable } from '../shared.js';

export interface AdminCreateOptions {
  email: string;
  password: string;
  name?: string;
}

export async function runAdminCreate(options: AdminCreateOptions): Promise<void> {
  loadEnv();
  await ensureDb();

  const { userService } = await import('../../services/user.service/index.js');

  let user;
  try {
    user = await userService.createUser({
      email: options.email,
      password: options.password,
      name: options.name,
      roles: ['admin', 'agent_creator'],
    });
  } catch (err) {
    fail(`Failed to create admin: ${err instanceof Error ? err.message : String(err)}`);
    process.exit(1);
  }

  ok(`Admin user created`);
  console.log('');
  console.log(`  ID:     ${user.id}`);
  console.log(`  Email:  ${user.email}`);
  console.log(`  Name:   ${user.name ?? '—'}`);
  console.log(`  Roles:  ${user.roles.join(', ')}`);
}

export async function runAdminList(): Promise<void> {
  loadEnv();
  await ensureDb();

  const { userService } = await import('../../services/user.service/index.js');

  const allUsers = await userService.listUsers();
  const admins = allUsers.filter((u) => u.roles.includes('admin'));

  if (admins.length === 0) {
    console.log('No admin users found. Run: gateway admin create --email <> --password <>');
    return;
  }

  printTable(
    ['ID', 'Email', 'Name', 'Active', 'Created'],
    admins.map((u) => [
      u.id,
      u.email,
      u.name ?? '—',
      u.isActive ? 'yes' : 'no',
      u.createdAt.toISOString().split('T')[0],
    ]),
  );
}
