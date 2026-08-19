import {AppRegistry} from 'react-native'

import Hello from './components/Hello'

// Register one entry per component the native side can open. The name here is the
// name the host app opens — keep them in sync.
AppRegistry.registerComponent('hello', () => Hello)
