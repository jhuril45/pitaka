import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';

import { useTheme } from '@/theme';

import { Icon } from './icon';

interface TextFieldProps extends TextInputProps {
  label?: string;
  error?: string;
}

/**
 * Filled text input. `label` is optional (the auth screens use the placeholder
 * alone); password fields get a show/hide toggle.
 */
export function TextField({ label, error, style, secureTextEntry, ...rest }: TextFieldProps) {
  const { colors, radius, spacing } = useTheme();
  const [hidden, setHidden] = useState(true);
  return (
    <View style={{ marginBottom: spacing.md }}>
      {label ? <Text style={[styles.label, { color: colors.text, marginBottom: spacing.xs }]}>{label}</Text> : null}
      <View>
        <TextInput
          placeholderTextColor={colors.textMuted}
          accessibilityLabel={label ?? rest.placeholder}
          secureTextEntry={secureTextEntry && hidden}
          style={[
            styles.input,
            {
              color: colors.text,
              backgroundColor: colors.surfaceMuted,
              borderColor: error ? colors.danger : 'transparent',
              borderRadius: radius.md,
              paddingHorizontal: spacing.lg,
            },
            secureTextEntry && styles.withToggle,
            style,
          ]}
          {...rest}
        />
        {secureTextEntry ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={hidden ? 'Show password' : 'Hide password'}
            onPress={() => setHidden((h) => !h)}
            hitSlop={8}
            style={[styles.toggle, { right: spacing.lg }]}>
            <Icon name={hidden ? 'eye' : 'eyeOff'} size={20} color={colors.textMuted} />
          </Pressable>
        ) : null}
      </View>
      {error ? <Text style={[styles.error, { color: colors.danger, marginTop: spacing.xs }]}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontSize: 14, fontWeight: '600' },
  input: { borderWidth: 1, paddingVertical: 14, fontSize: 15 },
  withToggle: { paddingRight: 48 },
  toggle: { position: 'absolute', top: 0, bottom: 0, justifyContent: 'center' },
  error: { fontSize: 13 },
});
