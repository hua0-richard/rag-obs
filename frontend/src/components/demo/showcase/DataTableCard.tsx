import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export function DataTableCard() {
    return (
        <Card>
            <CardHeader>
                <CardTitle>Data Table</CardTitle>
                <CardDescription>Dense data display with glass dividers</CardDescription>
            </CardHeader>
            <CardContent>
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[100px]">Invoice</TableHead>
                            <TableHead>Status</TableHead>
                            <TableHead>Method</TableHead>
                            <TableHead className="text-right">Amount</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {[
                            { id: "INV001", status: "Paid", method: "Credit Card", amount: "$250.00" },
                            { id: "INV002", status: "Pending", method: "PayPal", amount: "$150.00" },
                            { id: "INV003", status: "Unpaid", method: "Bank Transfer", amount: "$350.00" },
                        ].map((invoice) => (
                            <TableRow key={invoice.id}>
                                <TableCell className="font-medium text-white">{invoice.id}</TableCell>
                                <TableCell>
                                    <Badge variant={invoice.status === 'Paid' ? 'secondary' : invoice.status === 'Pending' ? 'outline' : 'destructive'}>
                                        {invoice.status}
                                    </Badge>
                                </TableCell>
                                <TableCell className="text-white/70">{invoice.method}</TableCell>
                                <TableCell className="text-right text-white">{invoice.amount}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </CardContent>
        </Card>
    );
}
