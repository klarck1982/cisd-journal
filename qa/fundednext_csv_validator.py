"""Standalone validator for FundedNext CSV structure.
Use: python fundednext_csv_validator.py path/to/report.csv
It does not change the report or send any data anywhere.
"""
import csv, sys
from pathlib import Path
REQUIRED = {'Ticket ID','Open Time','Open Price','Close Time','Close Price','Profit','Lots','Commission','Swap','Symbol','Type','SL','TP','Pips','Volume'}
def main(p):
    rows=list(csv.DictReader(Path(p).open(encoding='utf-8-sig', newline='')))
    headers=set(rows[0]) if rows else set()
    missing=REQUIRED-headers
    if missing: raise SystemExit('Missing columns: '+', '.join(sorted(missing)))
    tickets=[r['Ticket ID'] for r in rows if r['Ticket ID']]
    closed=[r for r in rows if 'currently running' not in r['Close Time'].lower()]
    opened=[r for r in rows if 'currently running' in r['Close Time'].lower()]
    net=sum(float(r['Profit'] or 0)+float(r['Commission'] or 0)+float(r['Swap'] or 0) for r in closed)
    print('VALID')
    print('rows=',len(rows),'closed=',len(closed),'open=',len(opened))
    print('unique_tickets=',len(set(tickets)),'duplicates=',len(tickets)-len(set(tickets)))
    print('net_closed_pnl=',round(net,2))
if __name__=='__main__': main(sys.argv[1])
