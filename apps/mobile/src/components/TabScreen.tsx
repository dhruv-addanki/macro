import type { ReactNode } from "react";
import { ScrollView, StyleSheet, View, type StyleProp, type ViewStyle } from "react-native";
import { colors } from "../theme/colors";
import { AppNav } from "./AppNav";
import { KeyboardAwareScrollView } from "./KeyboardForm";

export function TabScreen({
  children,
  contentContainerStyle,
  keyboardAware = false
}: {
  children: ReactNode;
  contentContainerStyle?: StyleProp<ViewStyle>;
  keyboardAware?: boolean;
}) {
  return (
    <View style={styles.container}>
      {keyboardAware ? (
        <KeyboardAwareScrollView contentContainerStyle={[styles.content, contentContainerStyle]}>
          {children}
        </KeyboardAwareScrollView>
      ) : (
        <ScrollView
          contentContainerStyle={[styles.content, contentContainerStyle]}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
        >
          {children}
        </ScrollView>
      )}
      <AppNav />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    backgroundColor: colors.background,
    flex: 1
  },
  content: {
    paddingBottom: 118
  }
});
