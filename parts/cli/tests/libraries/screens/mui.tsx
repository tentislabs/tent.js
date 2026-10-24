import createCache from '@emotion/cache'
import { CacheProvider } from '@emotion/react'
import { Button, Card, CardContent, Chip, Stack, Table, TableBody, TableCell, TableRow, Typography } from '@mui/material'
import { read, screen, useNonce } from 'tentjs/ui'
import { allSales } from '../functions'

// A library that writes its styles while it draws, by Emotion, whose cache carries the nonce of the page.
export const muiScreen = screen('muiScreen', {
  path: '/mui',
  access: 'anyone',
  data: { sales: read(allSales) },
  view: ({ sales }) => {
    const nonce = useNonce()
    return (
      <CacheProvider value={createCache({ key: 'css', nonce })}>
        <Card id="lib-card" variant="outlined" sx={{ width: 480, m: 2 }}>
          <CardContent>
            <Typography id="lib-heading" variant="h4" component="h2" sx={{ color: 'secondary.main' }}>
              MUI heading
            </Typography>
            <Stack id="lib-group" direction="row" spacing={2} sx={{ mt: 2 }}>
              <Chip id="lib-badge" color="success" label={`${sales.length} months`} />
              <Button id="lib-button" variant="contained">
                MUI button
              </Button>
            </Stack>
            <Table id="lib-table" size="small" sx={{ mt: 2 }}>
              <TableBody>
                {sales.map((row) => (
                  <TableRow key={row.id}>
                    <TableCell>{row.month}</TableCell>
                    <TableCell>{row.amount}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </CacheProvider>
    )
  },
})
