import { seed } from 'tentjs'
import { tasks } from './tables/tasks'

export default seed([tasks.add({ title: 'Buy milk' }), tasks.add({ title: 'Write home', done: true })])
