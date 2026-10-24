// The one place of this part that imports the half of React which draws on a server.
// It stands apart from what a view and a tag take, so that a browser is sent none of it.
export { renderToPipeableStream } from 'react-dom/server'
