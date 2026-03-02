import { Redirect } from 'expo-router';

export default function Index() {
  // Later this will check auth state
  // For now, send everyone to login
  return <Redirect href="/(auth)/login" />;
}