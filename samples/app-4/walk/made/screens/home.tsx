import { Form, read, screen } from 'tentjs/ui'
import { addTask, allTasks, finishTask } from '../functions/tasks'

const page = {
  fontFamily: 'system-ui, sans-serif',
  maxWidth: 560,
  margin: '0 auto',
  padding: '32px 20px',
  color: '#27272a',
}
const row = { display: 'flex', alignItems: 'center', gap: 12, padding: '10px 0', borderBottom: '1px solid #e4e4e7' }
const field = { display: 'grid', gap: 4, fontSize: 13, color: '#52525b' }
const box = { height: 36, padding: '0 10px', border: '1px solid #d4d4d8', borderRadius: 6, font: 'inherit' }
const press = {
  height: 36,
  padding: '0 14px',
  border: 0,
  borderRadius: 6,
  background: '#18181b',
  color: '#fff',
  font: 'inherit',
}

export const homeScreen = screen('homeScreen', {
  path: '/',
  title: 'My tasks',
  access: 'signedIn',
  data: { tasks: read(allTasks) },
  view: ({ tasks }) => (
    <main style={page}>
      <h1 style={{ fontSize: 28, margin: '0 0 16px' }}>My tasks</h1>
      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {tasks.map((task) => (
          <li key={task.id} style={row}>
            <Form call={finishTask} with={{ task: task.id }} id={`done-${task.id}`}>
              <button type="submit" aria-label={`Done: ${task.title}`} disabled={task.done}>
                {task.done ? '✓' : '○'}
              </button>
            </Form>
            <span
              style={{
                flex: 1,
                minWidth: 0,
                overflowWrap: 'anywhere',
                textDecoration: task.done ? 'line-through' : 'none',
              }}
            >
              {task.title}
            </span>
            {task.due && <time style={{ color: '#71717a', fontSize: 13 }}>{String(task.due)}</time>}
          </li>
        ))}
      </ul>
      {tasks.length === 0 && <p style={{ color: '#71717a' }}>Nothing to do yet.</p>}
      <Form
        call={addTask}
        aria-label="New task"
        style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'end', marginTop: 20 }}
      >
        <label style={{ ...field, flex: 1 }}>
          Task
          <input name="title" style={box} />
        </label>
        <label style={field}>
          Due
          <input name="due" type="date" style={box} />
        </label>
        <button type="submit" style={press}>
          Add
        </button>
      </Form>
    </main>
  ),
})
