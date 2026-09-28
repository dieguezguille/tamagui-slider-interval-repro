import { Text } from "react-native";
import { isWeb } from "tamagui";

export default function Index() {
  return <Text>tamagui loaded, isWeb: {String(isWeb)}</Text>;
}
