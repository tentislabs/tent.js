import '@mantine/core/styles.css'
import { Badge, Button, Card, Group, MantineProvider, Table, Title } from '@mantine/core'
import { read, screen, useNonce } from 'tentjs/ui'
import { allSales } from '../functions'

// A library of components whose styles stand in a stylesheet that the screen file imports, and which writes two
// style tags of its own, with the nonce of the page.
export const mantineScreen = screen('mantineScreen', {
  path: '/mantine',
  access: 'anyone',
  data: { sales: read(allSales) },
  view: ({ sales }) => {
    const nonce = useNonce()
    return (
      <MantineProvider getStyleNonce={() => nonce}>
        <Card id="lib-card" shadow="sm" padding="lg" radius="md" withBorder style={{ width: 480, margin: 16 }}>
          <Title id="lib-heading" order={2}>
            Mantine heading
          </Title>
          <Group id="lib-group" mt="md">
            <Badge id="lib-badge" color="pink">
              {sales.length} months
            </Badge>
            <Button id="lib-button" variant="filled" color="teal">
              Mantine button
            </Button>
          </Group>
          <Table id="lib-table" striped mt="md">
            <Table.Tbody>
              {sales.map((row) => (
                <Table.Tr key={row.id}>
                  <Table.Td>{row.month}</Table.Td>
                  <Table.Td>{row.amount}</Table.Td>
                </Table.Tr>
              ))}
            </Table.Tbody>
          </Table>
        </Card>
      </MantineProvider>
    )
  },
})

// A component of the library drawn with no provider around it, which the library's own code refuses as it draws.
export const mantineFaultScreen = screen('mantineFaultScreen', {
  path: '/mantine-fault',
  access: 'anyone',
  view: () => (
    <div>
      <Button id="lib-fault">No provider</Button>
    </div>
  ),
})
