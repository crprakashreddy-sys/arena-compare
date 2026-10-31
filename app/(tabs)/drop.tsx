// Placeholder route for the centre tab button, which opens the zap camera instead of this screen.
import { Redirect } from "expo-router";

export default function Drop() {
  return <Redirect href="/zap/nearest" />;
}
