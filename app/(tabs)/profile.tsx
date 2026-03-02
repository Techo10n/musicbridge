import { View, Text } from 'react-native';

export default function Home() {  // (change name per file)
  return (
    <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0f0f0f' }}>
      <Text style={{ color: '#fff' }}>Home</Text>
    </View>
  );
}