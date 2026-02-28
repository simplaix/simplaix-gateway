import * as SecureStore from 'expo-secure-store';

const GATEWAY_URL_KEY = 'gateway_url';
const AUTH_TOKEN_KEY = 'auth_token';
const PEER_ID_KEY = 'peer_id';

export async function getGatewayUrl(): Promise<string | null> {
  return SecureStore.getItemAsync(GATEWAY_URL_KEY);
}

export async function setGatewayUrl(url: string): Promise<void> {
  await SecureStore.setItemAsync(GATEWAY_URL_KEY, url);
}

export async function getAuthToken(): Promise<string | null> {
  return SecureStore.getItemAsync(AUTH_TOKEN_KEY);
}

export async function setAuthToken(token: string): Promise<void> {
  await SecureStore.setItemAsync(AUTH_TOKEN_KEY, token);
}

export async function getPeerId(): Promise<string | null> {
  return SecureStore.getItemAsync(PEER_ID_KEY);
}

export async function setPeerId(peerId: string): Promise<void> {
  await SecureStore.setItemAsync(PEER_ID_KEY, peerId);
}

export async function clearCredentials(): Promise<void> {
  await SecureStore.deleteItemAsync(GATEWAY_URL_KEY);
  await SecureStore.deleteItemAsync(AUTH_TOKEN_KEY);
  await SecureStore.deleteItemAsync(PEER_ID_KEY);
}
