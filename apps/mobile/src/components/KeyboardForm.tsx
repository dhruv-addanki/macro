import {
  InputAccessoryView,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type ScrollViewProps,
  type TextInputProps
} from "react-native";
import { createContext, useContext, useId, type ReactNode } from "react";
import { colors } from "../theme/colors";

const KeyboardAccessoryContext = createContext<string | undefined>(undefined);

type KeyboardAwareScrollViewProps = Omit<ScrollViewProps, "children"> & {
  children: ReactNode;
  keyboardVerticalOffset?: number;
};

export function KeyboardAwareScrollView({
  children,
  keyboardVerticalOffset = Platform.OS === "ios" ? 72 : 0,
  ...scrollProps
}: KeyboardAwareScrollViewProps) {
  const reactId = useId();
  const accessoryId = `macro-keyboard-${reactId.replace(/[^a-zA-Z0-9_-]/g, "")}`;

  return (
    <KeyboardAccessoryContext.Provider value={accessoryId}>
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={keyboardVerticalOffset}
        style={styles.container}
      >
        <ScrollView
          automaticallyAdjustKeyboardInsets={Platform.OS === "ios"}
          contentInsetAdjustmentBehavior="automatic"
          keyboardDismissMode={Platform.OS === "ios" ? "interactive" : "on-drag"}
          keyboardShouldPersistTaps="handled"
          {...scrollProps}
        >
          {children}
        </ScrollView>
        <KeyboardDoneAccessory nativeID={accessoryId} />
      </KeyboardAvoidingView>
    </KeyboardAccessoryContext.Provider>
  );
}

export function FormTextInput(props: TextInputProps) {
  const accessoryId = useContext(KeyboardAccessoryContext);

  return (
    <TextInput
      blurOnSubmit={props.blurOnSubmit ?? true}
      inputAccessoryViewID={Platform.OS === "ios" ? accessoryId : undefined}
      onSubmitEditing={props.onSubmitEditing ?? Keyboard.dismiss}
      returnKeyType={props.returnKeyType ?? "done"}
      {...props}
    />
  );
}

function KeyboardDoneAccessory({ nativeID }: { nativeID: string }) {
  if (Platform.OS !== "ios") return null;

  return (
    <InputAccessoryView nativeID={nativeID}>
      <View style={styles.accessory}>
        <Pressable accessibilityLabel="Dismiss keyboard" onPress={Keyboard.dismiss} style={styles.doneButton}>
          <Text style={styles.doneText}>Done</Text>
        </Pressable>
      </View>
    </InputAccessoryView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1
  },
  accessory: {
    alignItems: "flex-end",
    backgroundColor: colors.surface,
    borderTopColor: colors.border,
    borderTopWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  doneButton: {
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8
  },
  doneText: {
    color: colors.accentDark,
    fontSize: 15,
    fontWeight: "900"
  }
});
