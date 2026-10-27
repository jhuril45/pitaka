import { Redirect } from 'expo-router';

/**
 * Placeholder route for the center tab slot. Its tab button opens /quick-add,
 * so this screen is only reached by deep link — send those to the modal too.
 */
export default function AddRedirect() {
  return <Redirect href="/quick-add" />;
}
