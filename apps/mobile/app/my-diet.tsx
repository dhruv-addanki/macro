import { StyleSheet, Text, View } from "react-native";
import { TabScreen } from "../src/components/TabScreen";
import { colors } from "../src/theme/colors";

export default function MyDietScreen() {
  return (
    <TabScreen contentContainerStyle={styles.content}>
      <View>
        <Text style={styles.eyebrow}>Personal plan</Text>
        <Text style={styles.pageTitle}>My Diet</Text>
      </View>
      <View style={styles.blank} />
    </TabScreen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: 18,
    padding: 18,
    paddingTop: 14
  },
  eyebrow: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: "700"
  },
  pageTitle: {
    color: colors.text,
    fontSize: 31,
    fontWeight: "900",
    marginTop: 1
  },
  blank: {
    backgroundColor: colors.backgroundStrong,
    borderRadius: 8,
    flexGrow: 1,
    minHeight: 520
  }
});
